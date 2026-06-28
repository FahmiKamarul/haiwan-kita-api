import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/errorHandler';
import { VerifyAttendanceInput } from '../schemas/mission.schema';
import { generateAttendanceId } from '../utils/idGenerator';
import { emitSejarahUpdated } from '../socket/emitter';

// ── Attendance Service ───────────────────────────────────────────

export async function verifyAttendance(
  requestingUserId: string,
  input: VerifyAttendanceInput,
) {
  const { projectId, userId, notes } = input;

  // Members verify their own attendance; Admins can verify on behalf of others
  const targetUserId = userId ?? requestingUserId;

  // 1. Check project exists
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError(404, 'Project not found.');

  // 2. Check user is a participant
  const participant = await prisma.projectParticipant.findUnique({
    where: { userId_projectId: { userId: targetUserId, projectId } },
  });
  if (!participant) {
    throw new AppError(400, 'User is not a registered participant of this mission.');
  }

  // 3. Upsert attendance record
  const attendanceId = await generateAttendanceId(prisma);

  const attendance = await prisma.projectAttendance.upsert({
    where: { userId_projectId: { userId: targetUserId, projectId } },
    create: {
      id: attendanceId,  // ATT-XXXXX
      userId: targetUserId,
      projectId,
      status: 'VERIFIED',
      verifiedAt: new Date(),
      verifiedById: requestingUserId,
      notes,
      certificateStatus: 'GENERATING',
    },
    update: {
      status: 'VERIFIED',
      verifiedAt: new Date(),
      verifiedById: requestingUserId,
      notes,
      certificateStatus: 'GENERATING',
    },
  });

  // 4. Increment total missions for volunteer profile (non-blocking)
  prisma.volunteerProfile
    .updateMany({
      where: { userId: targetUserId },
      data: { totalMissions: { increment: 1 } },
    })
    .catch(console.error);

  // 5. Trigger background certificate generation (fire-and-forget)
  generateCertificateBackground(
    attendance.id,
    targetUserId,
    projectId,
    project.title,
  ).catch(console.error);

  // Notify the user's Sejarah tab immediately — attendance is now VERIFIED
  emitSejarahUpdated(targetUserId, {
    event: 'attendance_verified',
    projectId,
    projectTitle: project.title,
    timestamp: new Date().toISOString(),
  });

  return {
    attendanceId: attendance.id,
    status: attendance.status,
    verifiedAt: attendance.verifiedAt,
    certificateStatus: attendance.certificateStatus,
    message:
      'Attendance verified! Your participation certificate is being generated and will be available shortly.',
  };
}

// ── Certificate Generation (background job) ──────────────────────

async function generateCertificateBackground(
  attendanceId: string,
  userId: string,
  projectId: string,
  projectTitle: string,
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });

    if (!user) throw new Error('User not found for certificate generation');

    // Ensure output directory exists
    const certDir = path.join(process.cwd(), 'certificates');
    if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });

    const fileName = `cert_${attendanceId}.pdf`;
    const filePath = path.join(certDir, fileName);

    // Generate PDF
    await generatePdf(filePath, {
      recipientName: user.name,
      projectTitle,
      issuedDate: new Date().toLocaleDateString('ms-MY', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      certificateId: attendanceId,
    });

    // Relative URL to serve the certificate
    const certificateUrl = `/certificates/${fileName}`;

    // Update DB with certificate URL
    await prisma.projectAttendance.update({
      where: { id: attendanceId },
      data: {
        certificateStatus: 'GENERATED',
        certificateUrl,
        certificateGeneratedAt: new Date(),
      },
    });

    console.log(
      `[Certificate] Generated for ${user.name} (${attendanceId}): ${filePath}`,
    );

    // Notify the user's Sejarah tab — certificate is now ready to download
    emitSejarahUpdated(userId, {
      event: 'certificate_ready',
      projectId,
      certificateUrl,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Certificate] Generation failed:', err);
    await prisma.projectAttendance.update({
      where: { id: attendanceId },
      data: { certificateStatus: 'FAILED' },
    });

    // Notify the user so the UI can show a failure state instead of spinning
    emitSejarahUpdated(userId, {
      event: 'certificate_failed',
      projectId,
      timestamp: new Date().toISOString(),
    });
  }
}

interface CertData {
  recipientName: string;
  projectTitle: string;
  issuedDate: string;
  certificateId: string;
}

async function generatePdf(outputPath: string, data: CertData): Promise<void> {
  const templatePath = path.join(process.cwd(), 'src', 'templates', 'cert.html');
  
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found at ${templatePath}`);
  }

  let htmlContent = fs.readFileSync(templatePath, 'utf8');
  
  // Replace placeholders with actual data
  htmlContent = htmlContent.replace(/{{ VOLUNTEER_NAME }}/g, data.recipientName);
  htmlContent = htmlContent.replace(/{{ PROGRAM_NAME }}/g, data.projectTitle);
  htmlContent = htmlContent.replace(/{{ DATE_ISSUED }}/g, data.issuedDate);
  htmlContent = htmlContent.replace(/{{ CERTIFICATE_ID }}/g, data.certificateId);

  // Launch Puppeteer (in Docker it needs specific flags to run smoothly)
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    
    // We set the HTML content directly
    await page.setContent(htmlContent, { waitUntil: 'load' });

    // Generate PDF matching the A4 Landscape defined in CSS
    await page.pdf({
      path: outputPath,
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
  } finally {
    await browser.close();
  }
}
