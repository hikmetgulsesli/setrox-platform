import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Card, CardContent, Typography, Switch, IconButton, Chip, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
  Alert, CircularProgress, Tooltip, Stack,
} from '@mui/material';
import { Edit, Check, Close, Science } from '@mui/icons-material';
import { api } from '../api/client';

interface Provider {
  id: string;
  slug: string;
  displayName: string;
  type: 'vision' | 'text' | 'both';
  isEnabled: boolean;
  priority: number;
  costPer1kInput: number;
  costPer1kOutput: number;
  notes?: string;
  hasApiKey: boolean;
  baseUrl?: string;
}

const KNOWN_SLUGS = ['gemini-flash', 'gemini-pro', 'kimi', 'minimax'];

export function ProvidersPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ providers: Provider[] }>({
    queryKey: ['providers'],
    queryFn: async () => (await api.get('/v1/admin/providers')).data,
  });
  const toggle = useMutation({
    mutationFn: async (id: string) => (await api.post(`/v1/admin/providers/${id}/toggle`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['providers'] }),
  });
  const test = useMutation({
    mutationFn: async (id: string) => (await api.post(`/v1/admin/providers/${id}/test`)).data,
  });

  const [editing, setEditing] = useState<Provider | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  if (isLoading) {
    return <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>;
  }
  const providers = data?.providers ?? [];

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>AI Providers</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Configure and toggle AI providers. Changes apply immediately.
      </Typography>

      {testResult && (
        <Alert
          severity={testResult.success ? 'success' : 'error'}
          onClose={() => setTestResult(null)}
          sx={{ mb: 2 }}
        >
          {testResult.message}
        </Alert>
      )}

      <Stack spacing={2}>
        {providers.map((p) => (
          <Card key={p.id}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <Box flex={1}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Typography variant="h6" fontWeight={600}>{p.displayName}</Typography>
                    <Chip
                      label={p.slug}
                      size="small"
                      variant="outlined"
                      color={KNOWN_SLUGS.includes(p.slug) ? 'primary' : 'default'}
                    />
                    <Chip
                      label={p.type}
                      size="small"
                      variant="outlined"
                    />
                    {!p.hasApiKey && (
                      <Chip label="NO API KEY" size="small" color="warning" />
                    )}
                  </Box>
                  {p.notes && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {p.notes}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary">
                    Priority: {p.priority} · Cost: ${p.costPer1kInput}/1k in, ${p.costPer1kOutput}/1k out
                  </Typography>
                </Box>
                <Tooltip title={p.isEnabled ? 'Disable' : 'Enable'}>
                  <Switch
                    checked={p.isEnabled}
                    onChange={() => toggle.mutate(p.id)}
                    color="primary"
                  />
                </Tooltip>
                <Tooltip title="Test connection">
                  <IconButton
                    onClick={async () => {
                      const res = await test.mutateAsync(p.id);
                      setTestResult(res);
                    }}
                    disabled={!p.isEnabled || !p.hasApiKey}
                  >
                    <Science />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Edit">
                  <IconButton onClick={() => setEditing(p)}>
                    <Edit />
                  </IconButton>
                </Tooltip>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Stack>

      {editing && (
        <EditProviderDialog
          provider={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Box>
  );
}

function EditProviderDialog({ provider, onClose }: { provider: Provider; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    displayName: provider.displayName,
    apiKey: '',
    baseUrl: provider.baseUrl ?? '',
    costPer1kInput: provider.costPer1kInput,
    costPer1kOutput: provider.costPer1kOutput,
    priority: provider.priority,
    notes: provider.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        displayName: form.displayName,
        costPer1kInput: Number(form.costPer1kInput),
        costPer1kOutput: Number(form.costPer1kOutput),
        priority: Number(form.priority),
        notes: form.notes,
      };
      if (form.apiKey) payload.apiKey = form.apiKey;
      if (form.baseUrl) payload.baseUrl = form.baseUrl;
      return (await api.patch(`/v1/admin/providers/${provider.id}`, payload)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['providers'] });
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error?.message ?? 'Save failed'),
  });

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit {provider.displayName}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Display name"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            fullWidth
          />
          <TextField
            label="API Key (leave empty to keep existing)"
            type="password"
            value={form.apiKey}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            fullWidth
            autoComplete="off"
          />
          <TextField
            label="Base URL (optional)"
            value={form.baseUrl}
            onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
            fullWidth
          />
          <Stack direction="row" spacing={2}>
            <TextField
              label="Cost per 1k input"
              type="number"
              value={form.costPer1kInput}
              onChange={(e) => setForm({ ...form, costPer1kInput: Number(e.target.value) })}
              fullWidth
            />
            <TextField
              label="Cost per 1k output"
              type="number"
              value={form.costPer1kOutput}
              onChange={(e) => setForm({ ...form, costPer1kOutput: Number(e.target.value) })}
              fullWidth
            />
          </Stack>
          <TextField
            label="Priority"
            type="number"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
            fullWidth
            helperText="Lower = higher priority"
          />
          <TextField
            label="Notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            fullWidth
            multiline
            rows={2}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={() => save.mutate()} variant="contained" disabled={save.isPending}>
          {save.isPending ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
