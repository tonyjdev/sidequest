import { BarChart3 } from 'lucide-react';
import { useCallback } from 'react';

import { PageHeader } from '@web/components/layout/page-header';
import { PendingSection } from '@web/components/pending-section';
import { AsyncResourceView } from '@web/components/state/async-resource-view';
import { Badge } from '@web/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@web/components/ui/card';
import { useAsyncResource } from '@web/hooks/use-async-resource';
import { getHealth } from '@web/lib/api/health';
import { formatDuration } from '@web/lib/format';

export function DashboardPage() {
  const load = useCallback((signal: AbortSignal) => getHealth(signal), []);
  const health = useAsyncResource(load);

  return (
    <>
      <PageHeader
        title="Panel de control"
        description="Estado de la aplicación y, cuando haya intentos registrados, su evolución."
      />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Estado del sistema</CardTitle>
            <CardDescription>Sonda de salud de la API y de su base de datos.</CardDescription>
          </CardHeader>
          <CardContent>
            <AsyncResourceView
              resource={health}
              errorTitle="No se pudo leer el estado de la aplicación"
              loadingLines={4}
            >
              {(data) => (
                <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <dt className="text-sm text-muted-foreground">Aplicación</dt>
                    <dd>
                      <Badge variant={data.status === 'ok' ? 'secondary' : 'destructive'}>
                        {data.status === 'ok' ? 'Operativa' : 'Con fallos'}
                      </Badge>
                    </dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <dt className="text-sm text-muted-foreground">Base de datos</dt>
                    <dd className="flex items-center gap-2">
                      <Badge
                        variant={data.checks.database.status === 'ok' ? 'secondary' : 'destructive'}
                      >
                        {data.checks.database.status === 'ok' ? 'Conectada' : 'Sin conexión'}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {data.checks.database.message ??
                          `${String(data.checks.database.latency_ms)} ms`}
                      </span>
                    </dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <dt className="text-sm text-muted-foreground">Versión</dt>
                    <dd className="text-sm font-medium">{data.version}</dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <dt className="text-sm text-muted-foreground">En marcha desde hace</dt>
                    <dd className="text-sm font-medium">{formatDuration(data.uptime_s)}</dd>
                  </div>
                </dl>
              )}
            </AsyncResourceView>
          </CardContent>
        </Card>

        <PendingSection
          title="Evolución y resultados"
          description="Aciertos y fallos, evolución temporal, reparto por contenido y por dificultad."
          detail="Los agregados los calcula la API en su tarea; el cuadro de mando los dibujará aquí."
          task="SQST-0017"
          icon={BarChart3}
        />
      </div>
    </>
  );
}
