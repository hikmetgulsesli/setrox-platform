import { useQuery } from '@tanstack/react-query';
import {
  Box, Card, CardContent, Grid, Typography, CircularProgress, Alert, Stack, Chip,
} from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';
import { api } from '../api/client';

interface UsageTotals {
  requests: number;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  avgLatencyMs: number;
}
interface ProviderStat {
  providerId: string;
  providerName: string;
  providerSlug: string;
  requests: number;
  cost: number;
}
interface UsageResponse {
  totals: UsageTotals;
  byProvider: ProviderStat[];
  byApp: Array<{ appId: string; appName: string; appSlug: string; requests: number; cost: number }>;
  byDay: Array<{ date: string; requests: number; cost: number }>;
}

export function DashboardPage() {
  const { data, isLoading, error } = useQuery<UsageResponse>({
    queryKey: ['usage', '30d'],
    queryFn: async () => (await api.get('/v1/admin/usage')).data,
  });

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }
  if (error) {
    return <Alert severity="error">Failed to load dashboard data</Alert>;
  }
  if (!data) return null;

  const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n);
  const money = (n: number) => `$${n.toFixed(2)}`;

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        Dashboard
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Last 30 days overview
      </Typography>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="overline" color="text.secondary">Requests</Typography>
              <Typography variant="h4" fontWeight={700}>{fmt(data.totals.requests)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="overline" color="text.secondary">Total Cost</Typography>
              <Typography variant="h4" fontWeight={700} color="primary">
                {money(data.totals.cost)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="overline" color="text.secondary">Avg Latency</Typography>
              <Typography variant="h4" fontWeight={700}>{data.totals.avgLatencyMs}ms</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="overline" color="text.secondary">Tokens</Typography>
              <Typography variant="h4" fontWeight={700}>
                {fmt(data.totals.inputTokens + data.totals.outputTokens)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {fmt(data.totals.inputTokens)} in / {fmt(data.totals.outputTokens)} out
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {data.byDay.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Daily Requests</Typography>
            <LineChart
              height={300}
              series={[{
                data: data.byDay.map((d) => d.requests),
                label: 'Requests',
                color: '#14B8A6',
                area: true,
              }]}
              xAxis={[{
                data: data.byDay.map((d) => d.date),
                scaleType: 'point',
              }]}
              margin={{ left: 50, right: 20, top: 20, bottom: 30 }}
            />
          </CardContent>
        </Card>
      )}

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>By Provider</Typography>
              <Stack spacing={1.5}>
                {data.byProvider.length === 0 && (
                  <Typography variant="body2" color="text.secondary">No data yet</Typography>
                )}
                {data.byProvider.map((p) => (
                  <Box key={p.providerId} display="flex" justifyContent="space-between" alignItems="center">
                    <Box>
                      <Typography variant="body2" fontWeight={600}>{p.providerName}</Typography>
                      <Typography variant="caption" color="text.secondary">{p.providerSlug}</Typography>
                    </Box>
                    <Box textAlign="right">
                      <Typography variant="body2" fontWeight={600}>{fmt(p.requests)}</Typography>
                      <Typography variant="caption" color="primary">{money(p.cost)}</Typography>
                    </Box>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>By Application</Typography>
              <Stack spacing={1.5}>
                {data.byApp.length === 0 && (
                  <Typography variant="body2" color="text.secondary">No data yet</Typography>
                )}
                {data.byApp.map((a) => (
                  <Box key={a.appId} display="flex" justifyContent="space-between" alignItems="center">
                    <Box>
                      <Typography variant="body2" fontWeight={600}>{a.appName}</Typography>
                      <Chip label={a.appSlug} size="small" sx={{ mt: 0.5 }} />
                    </Box>
                    <Box textAlign="right">
                      <Typography variant="body2" fontWeight={600}>{fmt(a.requests)}</Typography>
                      <Typography variant="caption" color="primary">{money(a.cost)}</Typography>
                    </Box>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
