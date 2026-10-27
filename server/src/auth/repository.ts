import { UserModel } from '../models/users.js';
import type { UserRecord } from '../models/users.js';
import type { AuthRepository, AuthUser } from './types.js';
import type { Model } from 'mongoose';

const users = UserModel as Model<UserRecord>;

export const userRepository: AuthRepository = {
  async findByEmail(email): Promise<AuthUser | null> {
    return (await users
      .findOne({ email })
      .select('+passwordHash')
      .lean()
      .exec()) as AuthUser | null;
  },
  async findById(id): Promise<AuthUser | null> {
    return (await users.findById(id).lean().exec()) as AuthUser | null;
  },
  async updateLastLogin(id, date): Promise<void> {
    await users.updateOne({ _id: id, status: 'active' }, { $set: { lastLoginAt: date } }).exec();
  },
  async updateDisplayName(id, displayName): Promise<AuthUser | null> {
    return (await users.findOneAndUpdate(
      { _id: id, status: 'active' },
      { $set: { displayName } },
      { new: true, runValidators: true },
    ).lean().exec()) as AuthUser | null;
  },
};
