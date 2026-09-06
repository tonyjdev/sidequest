import { asc, eq } from 'drizzle-orm';

import type { Database } from '@app/db/client.js';
import { requireRow } from '@app/db/repositories/shared.js';
import { tags } from '@app/db/schema.js';
import type { Tag } from '@app/domain/questions.js';
import type { TagRepository } from '@app/domain/repositories.js';

const NOT_FOUND = 'La etiqueta no existe';

export function createTagRepository(db: Database): TagRepository {
  return {
    list(): Promise<Tag[]> {
      return db.select().from(tags).orderBy(asc(tags.id));
    },

    async findById(id: number): Promise<Tag | null> {
      return (await findTag(id)) ?? null;
    },

    async findBySlug(slug: string): Promise<Tag | null> {
      const [row] = await db.select().from(tags).where(eq(tags.slug, slug)).limit(1);

      return row ?? null;
    },

    async create(input: { readonly slug: string; readonly name: string }): Promise<Tag> {
      const [inserted] = await db.insert(tags).values({ slug: input.slug, name: input.name });

      return requireRow(await findTag(inserted.insertId), NOT_FOUND, { tagId: inserted.insertId });
    },

    async update(
      id: number,
      patch: { readonly slug?: string | undefined; readonly name?: string | undefined },
    ): Promise<Tag> {
      const values: { slug?: string; name?: string } = {};

      if (patch.slug !== undefined) values.slug = patch.slug;
      if (patch.name !== undefined) values.name = patch.name;

      if (Object.keys(values).length > 0) {
        await db.update(tags).set(values).where(eq(tags.id, id));
      }

      return requireRow(await findTag(id), NOT_FOUND, { tagId: id });
    },
  };

  async function findTag(id: number): Promise<Tag | undefined> {
    const [row] = await db.select().from(tags).where(eq(tags.id, id)).limit(1);

    return row;
  }
}
