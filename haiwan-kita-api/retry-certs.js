const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const fs = require('fs');

async function retryFailedCerts() {
  console.log('Fetching FAILED certificates...');
  const failed = await prisma.projectAttendance.findMany({
    where: { certificateStatus: { in: ['FAILED', 'GENERATING'] } },
    include: { project: true, user: true }
  });

  console.log(`Found ${failed.length} failed certificates.`);
  
  if (failed.length === 0) return;

  const puppeteerCore = require('puppeteer-core');
  
  const browser = await puppeteerCore.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    headless: true,
    ignoreHTTPSErrors: true,
  });

  for (const att of failed) {
    console.log(`Retrying cert for attendance ${att.id} (user: ${att.userId}, project: ${att.projectId})`);
    
    // Set back to generating
    await prisma.projectAttendance.update({
      where: { id: att.id },
      data: { certificateStatus: 'GENERATING' }
    });

    try {
      const templatePath = path.join(process.cwd(), 'src', 'templates', 'cert.html');
      let htmlContent = fs.readFileSync(templatePath, 'utf8');
      
      htmlContent = htmlContent.replace(/{{ VOLUNTEER_NAME }}/g, att.user.name);
      htmlContent = htmlContent.replace(/{{ PROGRAM_NAME }}/g, att.project.title);
      htmlContent = htmlContent.replace(/{{ DATE_ISSUED }}/g, new Date().toLocaleDateString('ms-MY', { year: 'numeric', month: 'long', day: 'numeric' }));
      htmlContent = htmlContent.replace(/{{ CERTIFICATE_ID }}/g, att.id);

      const certDir = path.join(process.cwd(), 'certificates');
      if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });

      const fileName = `cert_${att.id}.pdf`;
      const filePath = path.join(certDir, fileName);

      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'load' });
      await page.pdf({
        path: filePath,
        format: 'A4',
        landscape: true,
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });
      await page.close();

      const certificateUrl = `/certificates/${fileName}`;

      await prisma.projectAttendance.update({
        where: { id: att.id },
        data: {
          certificateStatus: 'GENERATED',
          certificateUrl,
          certificateGeneratedAt: new Date(),
        },
      });

      console.log(`Successfully generated cert for ${att.id} -> ${certificateUrl}`);
    } catch (e) {
      console.error(`Error generating cert for ${att.id}:`, e);
      await prisma.projectAttendance.update({
        where: { id: att.id },
        data: { certificateStatus: 'FAILED' }
      });
    }
  }

  await browser.close();
  console.log('Done retrying.');
  await prisma.$disconnect();
}

retryFailedCerts().catch(e => {
  console.error(e);
  process.exit(1);
});
