import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/errorHandler';
import { VerifyAttendanceInput } from '../schemas/mission.schema';

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
  const attendance = await prisma.projectAttendance.upsert({
    where: { userId_projectId: { userId: targetUserId, projectId } },
    create: {
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
  generateCertificateBackground(attendance.id, targetUserId, projectId, project.title).catch(
    console.error,
  );

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

    // In production: send push notification or email to user here
    // notificationService.notifyUser(userId, 'certificate_ready', { certificateUrl });
  } catch (err) {
    console.error('[Certificate] Generation failed:', err);
    await prisma.projectAttendance.update({
      where: { id: attendanceId },
      data: { certificateStatus: 'FAILED' },
    });
  }
}

interface CertData {
  recipientName: string;
  projectTitle: string;
  issuedDate: string;
}

function generatePdf(outputPath: string, data: CertData): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 60 });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    // Background color
    doc.rect(0, 0, doc.page.width, doc.page.height).fill('#f8f5f0');

    // Border
    doc
      .rect(30, 30, doc.page.width - 60, doc.page.height - 60)
      .lineWidth(3)
      .strokeColor('#2d6a4f')
      .stroke();

    // Title
    doc
      .fillColor('#1b4332')
      .fontSize(36)
      .font('Helvetica-Bold')
      .text('SIJIL PENYERTAAN', { align: 'center' })
      .moveDown(0.3);

    doc
      .fontSize(14)
      .font('Helvetica')
      .fillColor('#555')
      .text('Certificate of Participation', { align: 'center' })
      .moveDown(1.5);

    // Recipient
    doc
      .fontSize(18)
      .fillColor('#333')
      .font('Helvetica')
      .text('Ini adalah untuk mengesahkan bahawa / This is to certify that', {
        align: 'center',
      })
      .moveDown(0.5);

    doc
      .fontSize(28)
      .font('Helvetica-Bold')
      .fillColor('#1b4332')
      .text(data.recipientName, { align: 'center' })
      .moveDown(0.5);

    doc
      .fontSize(16)
      .font('Helvetica')
      .fillColor('#333')
      .text(`telah menyertai misi / has participated in the mission:`, {
        align: 'center',
      })
      .moveDown(0.3);

    doc
      .fontSize(22)
      .font('Helvetica-Bold')
      .fillColor('#2d6a4f')
      .text(`"${data.projectTitle}"`, { align: 'center' })
      .moveDown(1.5);

    // Footer
    doc
      .fontSize(12)
      .font('Helvetica')
      .fillColor('#777')
      .text(`Tarikh Dikeluarkan: ${data.issuedDate}`, { align: 'center' })
      .moveDown(0.3)
      .text('Haiwan Kita — Bersama Melindungi Mereka', { align: 'center' });

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}
