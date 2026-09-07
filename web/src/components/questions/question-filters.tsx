import { Search } from 'lucide-react';

import { Button } from '@web/components/ui/button';
import { Input } from '@web/components/ui/input';
import { Label } from '@web/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@web/components/ui/select';
import { difficulties, type Difficulty, type Tag } from '@web/lib/api/questions';
import type { SubtopicPath } from '@web/lib/content-tree';
import { ANY, type QuestionFilterState } from '@web/lib/question-filters';
import { DIFFICULTY_WORDS, QUESTION_STATUS_FILTERS } from '@web/lib/question-labels';

/**
 * Los cinco filtros del listado, cada uno con la primitiva que le toca: el
 * estado se ve entero de un vistazo, así que va en botones; el resto, en
 * desplegables, porque los subtemas y las etiquetas no caben en una fila.
 */

interface QuestionFiltersProps {
  readonly value: QuestionFilterState;
  readonly onChange: (value: QuestionFilterState) => void;
  readonly subtopics: readonly SubtopicPath[];
  readonly tags: readonly Tag[];
}

export function QuestionFilters({ value, onChange, subtopics, tags }: QuestionFiltersProps) {
  const update = (patch: Partial<QuestionFilterState>): void => {
    onChange({ ...value, ...patch });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por estado">
        {QUESTION_STATUS_FILTERS.map((option) => (
          <Button
            key={option.value}
            size="sm"
            variant={option.value === value.status ? 'secondary' : 'ghost'}
            aria-pressed={option.value === value.status}
            onClick={() => {
              update({ status: option.value });
            }}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="filter-search">Buscar en el enunciado</Label>
          <div className="relative">
            <Search
              className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="filter-search"
              className="pl-8"
              value={value.search}
              placeholder="ecuación"
              onChange={(event) => {
                update({ search: event.target.value });
              }}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="filter-subtopic">Subtema</Label>
          <Select
            value={value.subtopicId === null ? ANY : String(value.subtopicId)}
            onValueChange={(next) => {
              update({ subtopicId: next === ANY ? null : Number(next) });
            }}
          >
            <SelectTrigger id="filter-subtopic" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Cualquier subtema</SelectItem>
              {subtopics.map((path) => (
                <SelectItem key={path.subtopic.id} value={String(path.subtopic.id)}>
                  {path.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="filter-difficulty">Dificultad</Label>
          <Select
            value={value.difficulty ?? ANY}
            onValueChange={(next) => {
              update({ difficulty: next === ANY ? null : (next as Difficulty) });
            }}
          >
            <SelectTrigger id="filter-difficulty" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Cualquier dificultad</SelectItem>
              {difficulties.map((difficulty) => (
                <SelectItem key={difficulty} value={difficulty}>
                  {DIFFICULTY_WORDS[difficulty]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="filter-tag">Etiqueta</Label>
          <Select
            value={value.tagId === null ? ANY : String(value.tagId)}
            onValueChange={(next) => {
              update({ tagId: next === ANY ? null : Number(next) });
            }}
          >
            <SelectTrigger id="filter-tag" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Cualquier etiqueta</SelectItem>
              {tags.map((tag) => (
                <SelectItem key={tag.id} value={String(tag.id)}>
                  {tag.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
