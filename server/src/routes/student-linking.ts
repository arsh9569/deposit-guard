import { Router } from 'express';
import { Types, type Model } from 'mongoose';
import { z } from 'zod';
import { requireAuthentication } from '../middleware/authentication.js';
import { requireInstitutionRole } from '../middleware/authorization.js';
import { StudentProfileModel } from '../models/student-profiles.js';
import { UserModel } from '../models/users.js';
import { FdrModel, type FdrRecord } from '../models/fdrs.js';
const fdrs = FdrModel as Model<FdrRecord>;

const linkSchema = z.object({ email: z.string().trim().email(), enrollment: z.string().trim().min(1), admissionVerified: z.literal(true) });
const assignSchema = z.object({ studentId: z.string().regex(/^[a-f\d]{24}$/i) });
export function createStudentLinkingRouter() {
  const router = Router({ mergeParams: true });
  router.use(requireAuthentication);
  router.use(
  requireInstitutionRole([
    'institution_admin',
    'institution_operator',
  ]),
);
  const institutionId = (req: import('express').Request) => new Types.ObjectId(req.institutionScope!.institutionId);

  router.get('/students', async (req, res, next) => {
    try {
      const students = await StudentProfileModel.find({ institutionId: institutionId(req) }).select('userId enrollment course').lean();
      res.json({ students: students.map(s => ({ studentId: String(s.userId), enrollment: s.enrollment, course: s.course })) });
    } catch (error) { next(error); }
  });

  // An institution administrator confirms the admission against institutional records.
  router.get('/fdrs', async (req, res, next) => {
    try {
      const records = await fdrs.find({ institutionId: institutionId(req), submissionStatus: 'submitted' }).select('_id reference bankName studentId').sort({ createdAt: -1 }).limit(200).lean();
      res.json({ fdrs: records.map(f => ({ id: String(f._id), reference: f.reference, bankName: f.bankName, studentId: f.studentId ? String(f.studentId) : null })) });
    } catch (error) { next(error); }
  });

  router.post('/students/link', async (req, res, next) => {
    try {
      const parsed = linkSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Student email, enrollment and admission confirmation required' }); return; }
      const user = await UserModel.findOne({
  email: parsed.data.email.trim().toLowerCase(),
  status: 'active',
}).select('_id accountType');

if (!user) {
  res.status(404).json({ error: 'Active account not found for this email' });
  return;
}

if (user.accountType === 'institution') {
  res.status(403).json({ error: 'Institution account cannot be linked as a student' });
  return;
}
      const profile = await StudentProfileModel.findOne({ userId: user._id, enrollment: parsed.data.enrollment });
      if (!profile) { res.status(404).json({ error: 'Student enrollment not found' }); return; }
      if (profile.institutionId && String(profile.institutionId) !== String(institutionId(req))) {
        res.status(409).json({ error: 'Student is linked to another institution' }); return;
      }
      profile.institutionId = institutionId(req);
      await profile.save();
      res.json({ studentId: String(user._id), enrollment: profile.enrollment, linked: true });
    } catch (error) { next(error); }
  });

  router.post('/fdrs/:instrumentId/assign', async (req, res, next) => {
    try {
      const parsed = assignSchema.safeParse(req.body);
      if (!Types.ObjectId.isValid(req.params.instrumentId as string) || !parsed.success) {
        res.status(400).json({ error: 'Invalid FDR or student ID' }); return;
      }
      const profile = await StudentProfileModel.findOne({ userId: parsed.data.studentId, institutionId: institutionId(req) });
      if (!profile) { res.status(404).json({ error: 'Student is not linked to this institution' }); return; }
      const fdr = await fdrs.findOne({ _id: req.params.instrumentId, institutionId: institutionId(req) });
      if (!fdr) { res.status(404).json({ error: 'FDR not found' }); return; }
      if (fdr.studentId && String(fdr.studentId) !== parsed.data.studentId) {
        res.status(409).json({ error: 'FDR already assigned to another student' }); return;
      }
      await fdr.updateOne({
  $set: {
    studentId: new Types.ObjectId(parsed.data.studentId),
  },
});
      res.json({ assigned: true, instrumentId: String(fdr._id), studentId: parsed.data.studentId });
    } catch (error) { next(error); }
  });
  return router;
}
