import { savedApiModel } from "../models/SavedApiModel";

export interface SavedApi {
  apiId: string;
  savedAt: string;
}

export interface ISavedApiRepository {
  /** Most recently saved first. */
  list(userId: string): Promise<SavedApi[]>;
  /** Saving twice keeps the first date. */
  save(userId: string, apiId: string): Promise<void>;
  /** Removing one that isn't saved does nothing. */
  remove(userId: string, apiId: string): Promise<void>;
}

export class SavedApiRepository implements ISavedApiRepository {
  async list(userId: string): Promise<SavedApi[]> {
    const docs = await savedApiModel.find({ userId }).sort({ createdAt: -1, _id: -1 }).lean().exec();
    return docs.map((d) => ({ apiId: d.apiId, savedAt: d.createdAt.toISOString() }));
  }

  async save(userId: string, apiId: string): Promise<void> {
    try {
      await savedApiModel
        .updateOne({ userId, apiId }, { $setOnInsert: { userId, apiId } }, { upsert: true })
        .exec();
    } catch (err) {
      // Two upserts at once can race; either way it's saved.
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  }

  async remove(userId: string, apiId: string): Promise<void> {
    await savedApiModel.deleteOne({ userId, apiId }).exec();
  }
}
