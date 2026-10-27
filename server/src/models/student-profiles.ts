import mongoose, { Schema, type Model, Types } from 'mongoose';

export interface StudentProfileRecord {
  userId: Types.ObjectId;
  institutionId?: Types.ObjectId;
  phone: string;
  enrollment: string;
  course: string;
  institutionName: string;
  createdAt: Date;
  updatedAt: Date;
}

const studentProfileSchema = new Schema<StudentProfileRecord>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    institutionId: {
  type: Schema.Types.ObjectId,
  ref: 'Institution',
},
    phone: {
      type: String,
      required: true,
      match: /^\d{10}$/,
    },
    enrollment: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    course: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    institutionName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
  },
  { timestamps: true, strict: 'throw' },
);
studentProfileSchema.index(
  { institutionId: 1, enrollment: 1 },
  {
    name: 'student_institution_enrollment',
  },
);

export const StudentProfileModel: Model<StudentProfileRecord> =
 (mongoose.models.StudentProfile as Model<StudentProfileRecord> | undefined) ??
mongoose.model<StudentProfileRecord>('StudentProfile', studentProfileSchema);