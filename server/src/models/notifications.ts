import mongoose, { model, Schema, Types } from 'mongoose';
import { notificationStates, type NotificationState } from './domain.js';

export interface NotificationRecord {
  institutionId: Types.ObjectId;
  recipientId: Types.ObjectId;
  kind: string;
  title: string;
  message: string;
  resourceType?: string;
  resourceId?: Types.ObjectId;
  dedupeKey?: string;
  deliveryStatus: 'pending' | 'retrying' | 'delivered' | 'failed';
  deliveryAttempts: number;
  nextAttemptAt?: Date;
  lastAttemptAt?: Date;
  deliveredAt?: Date;
  lastDeliveryError?: string;
  state: NotificationState;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<NotificationRecord>(
  {
    institutionId: {
      type: Schema.Types.ObjectId,
      ref: 'Institution',
      required: true,
      immutable: true,
    },
    recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    kind: { type: String, required: true, trim: true, maxlength: 80, immutable: true },
    title: { type: String, required: true, trim: true, maxlength: 180, immutable: true },
    message: { type: String, required: true, trim: true, maxlength: 2000, immutable: true },
    resourceType: { type: String, trim: true, immutable: true },
    resourceId: { type: Schema.Types.ObjectId, immutable: true },
    dedupeKey: { type: String, immutable: true },
    deliveryStatus: { type: String, enum: ['pending', 'retrying', 'delivered', 'failed'], default: 'pending', required: true },
    deliveryAttempts: { type: Number, min: 0, default: 0, required: true },
    nextAttemptAt: { type: Date },
    lastAttemptAt: { type: Date },
    deliveredAt: { type: Date },
    lastDeliveryError: { type: String, trim: true, maxlength: 500 },
    state: { type: String, enum: notificationStates, required: true, default: 'unread' },
    readAt: { type: Date },
  },
  { timestamps: true, strict: 'throw' },
);
notificationSchema.pre('validate', function () {
  if (this.kind.startsWith('maturity_') && !this.dedupeKey) this.invalidate('dedupeKey', 'maturity notifications require an idempotency key');
});
notificationSchema.index(
  { institutionId: 1, recipientId: 1, state: 1, createdAt: -1 },
  { name: 'notification_inbox' },
);
notificationSchema.index({ institutionId: 1, recipientId: 1, dedupeKey: 1 }, { unique: true, name: 'notification_idempotency_key', partialFilterExpression: { dedupeKey: { $type: 'string' } } });
notificationSchema.index({ deliveryStatus: 1, nextAttemptAt: 1 }, { name: 'notification_delivery_queue' });
notificationSchema.index(
  { institutionId: 1, resourceType: 1, resourceId: 1 },
  { name: 'notification_resource' },
);

export const NotificationModel =
  mongoose.models.Notification ?? model<NotificationRecord>('Notification', notificationSchema);
