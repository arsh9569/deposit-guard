import { Router } from 'express';
import { Types, type Model } from 'mongoose';
import { z } from 'zod';
import { requireAuthentication } from '../middleware/authentication.js';
import { StudentProfileModel } from '../models/student-profiles.js';
import { FdrModel, type FdrRecord } from '../models/fdrs.js';
import { DocumentModel } from '../models/documents.js';
import { ReleaseRequestModel, type ReleaseRequestRecord } from '../models/release-requests.js';
const fdrModel = FdrModel as Model<FdrRecord>;
const releases = ReleaseRequestModel as Model<ReleaseRequestRecord>;

export const studentPortalRouter = Router();
studentPortalRouter.use(requireAuthentication);
studentPortalRouter.use(async (req, res, next) => {
  try {
    const user = req.authUser;

    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const studentProfile = await StudentProfileModel.exists({
      userId: user._id,
    });

    if (!studentProfile || user.accountType === 'institution') {
      res.status(403).json({ error: 'Student access only' });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
});

studentPortalRouter.get('/records', async (req, res, next) => {
  try {
    const userId = req.authUser!._id;
    const profile = await StudentProfileModel.findOne({ userId }).lean();
    const fdrs = profile?.institutionId
      ? await fdrModel.find({ studentId: userId, institutionId: profile.institutionId, submissionStatus: 'submitted' }).sort({ maturityDate: 1 }).lean()
      : [];
    const assignedFdrs = await fdrModel.find({
  studentId: userId,
})
  .select('reference studentId institutionId submissionStatus')
  .lean();

console.log('Student assigned FDRs:', assignedFdrs);
console.log('Student linked institution:', String(profile?.institutionId));
    const ids = fdrs.map(f => f._id);
    const documents = ids.length ? await DocumentModel.find({ instrumentId: { $in: ids }, institutionId: profile!.institutionId }).select('_id instrumentId originalFileName contentType createdAt').lean() : [];
    const refunds = ids.length ? await releases.find({ instrumentId: { $in: ids }, institutionId: profile!.institutionId, requestedBy: userId }).sort({ createdAt: -1 }).lean() : [];
    res.setHeader('Cache-Control', 'no-store');
    res.json({ linked: Boolean(profile?.institutionId), fdrs: fdrs.map(f => ({ id: String(f._id), reference: f.reference, bankName: f.bankName, amount: f.principalAmount?.toString() ?? '', currency: f.currency, maturityDate: f.maturityDate?.toISOString() ?? '', issueDate: f.issueDate?.toISOString() ?? '', reviewStatus: f.reviewStatus, verificationStatus: f.verificationStatus, instrumentState: f.instrumentState })), documents: documents.map(d => ({ id: String(d._id), fdrId: String(d.instrumentId), name: d.originalFileName, uploadedAt: d.createdAt.toISOString() })), refunds: refunds.map(r => ({ id: String(r._id), fdrId: String(r.instrumentId), status: r.status, reason: r.reason, createdAt: r.createdAt.toISOString() })) });
  } catch (error) { next(error); }
});

const refundSchema = z.object({ fdrId: z.string().regex(/^[a-f\d]{24}$/i), reason: z.string().trim().min(10).max(4000) });
studentPortalRouter.post('/refunds', async (req, res, next) => {
  try {
    const parsed = refundSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Select an FDR and provide a reason (10+ characters)' }); return; }
    const profile = await StudentProfileModel.findOne({ userId: req.authUser!._id });
    if (!profile?.institutionId) { res.status(403).json({ error: 'Institution link required' }); return; }
    const fdr = await fdrModel.findOne({ _id: new Types.ObjectId(parsed.data.fdrId), studentId: req.authUser!._id, institutionId: profile.institutionId, submissionStatus: 'submitted' });
    if (!fdr) { res.status(404).json({ error: 'FDR not found' }); return; }
    const existing = await releases.exists({ institutionId: profile.institutionId, instrumentId: fdr._id, requestedBy: req.authUser!._id, status: { $in: ['requested', 'under_review', 'approved'] } });
    if (existing) { res.status(409).json({ error: 'A refund request is already in progress for this FDR' }); return; }
    const refund = await releases.create({ institutionId: profile.institutionId, instrumentId: fdr._id, requestedBy: req.authUser!._id, requestType: 'matured_refund', reason: parsed.data.reason, supportingDocumentIds: [], status: 'requested', history: [{ status: 'requested', actorId: req.authUser!._id, reason: 'Student submitted refund request', at: new Date() }] });
    res.status(201).json({ id: String(refund._id), status: refund.status });
  } catch (error) { next(error); }
});
