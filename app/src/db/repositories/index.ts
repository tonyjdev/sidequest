import type { Database } from '@app/db/client.js';
import { createAttemptRepository } from '@app/db/repositories/attempts.js';
import { createQuestionRepository } from '@app/db/repositories/questions.js';
import { createSessionRepository } from '@app/db/repositories/sessions.js';
import { createSettingsRepository } from '@app/db/repositories/settings.js';
import { createSubjectRepository } from '@app/db/repositories/subjects.js';
import { createSubtopicRepository } from '@app/db/repositories/subtopics.js';
import { createTagRepository } from '@app/db/repositories/tags.js';
import { createTopicRepository } from '@app/db/repositories/topics.js';
import type { Repositories } from '@app/domain/repositories.js';

/**
 * Los puertos del dominio, atados a MySQL. Es el único punto del que cuelga
 * Drizzle: cambiar de persistencia sería reescribir esta carpeta, y ni una
 * línea de `domain/`.
 */
export function createRepositories(db: Database): Repositories {
  return {
    subjects: createSubjectRepository(db),
    topics: createTopicRepository(db),
    subtopics: createSubtopicRepository(db),
    questions: createQuestionRepository(db),
    tags: createTagRepository(db),
    sessions: createSessionRepository(db),
    attempts: createAttemptRepository(db),
    settings: createSettingsRepository(db),
  };
}
