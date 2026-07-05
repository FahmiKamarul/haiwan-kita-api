const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const fs = require('fs');

async function regenerateCerts() {
  console.log('Fetching all generated certificates to update with the new template...');
  const certs = await prisma.projectAttendance.findMany({
    where: { certificateStatus: 'GENERATED' },
    include: { project: true, user: true }
  });

  console.log(`Found ${certs.length} certificates to regenerate.`);
  
  if (certs.length === 0) return;

  const puppeteerCore = require('puppeteer-core');
  
  const browser = await puppeteerCore.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    headless: true,
    ignoreHTTPSErrors: true,
  });

  for (const att of certs) {
    console.log(`Regenerating cert for attendance ${att.id} (user: ${att.userId}, project: ${att.projectId})`);

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
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
      await page.pdf({
        path: filePath,
        format: 'A4',
        landscape: true,
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });
      await page.close();

      console.log(`Successfully updated cert for ${att.id}`);
    } catch (e) {
      console.error(`Error regenerating cert for ${att.id}:`, e);
    }
  }

  await browser.close();
  console.log('Done regenerating.');
  await prisma.$disconnect();
}

regenerateCerts().catch(e => {
  console.error(e);
  process.exit(1);
});
