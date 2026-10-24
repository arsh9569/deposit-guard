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
    state: { type: String, enum: notificationStates, required: true, default: 'unread' },
    readAt: { type: Date },
  },
  { timestamps: true, strict: 'throw' },
);
notificationSchema.index(
  { institutionId: 1, recipientId: 1, state: 1, createdAt: -1 },
  { name: 'notification_inbox' },
);
notificationSchema.index(
  { institutionId: 1, resourceType: 1, resourceId: 1 },
  { name: 'notification_resource' },
);

export const NotificationModel =
  mongoose.models.Notification ?? model<NotificationRecord>('Notification', notificationSchema);
