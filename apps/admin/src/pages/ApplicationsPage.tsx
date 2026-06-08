import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Card, CardContent, Typography, Button, Chip, Stack, Switch,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Alert, CircularProgress,
  IconButton, Tooltip,
} from '@mui/material';
import { Add, ContentCopy, Refresh, KeyOff } from '@mui/icons-material';
import { api } from '../api/client';

interface App {
  id: string;
  slug: string;
  name: string;
  description?: string;
  isActive: boolean;
  freeQuotaPerDay: number;
  totalUsers: number;
  totalRequests: number;
}

interface CreateResult {
  application: { id: string; slug: string; apiKey: string };
}

export function ApplicationsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ applications: App[] }>({
    queryKey: ['apps'],
    queryFn: async () => (await api.get('/v1/admin/applications')).data,
  });
  const toggle = useMutation({
    mutationFn: async (id: string) => (await api.patch(`/v1/admin/applications/${id}`, { isActive: !data?.applications.find((a) => a.id === id)?.isActive })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apps'] }),
  });
  const regen = useMutation({
    mutationFn: async (id: string) => (await api.post(`/v1/admin/applications/${id}/regenerate-key`)).data,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (isLoading) {
    return <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>;
  }
  const apps = data?.applications ?? [];

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Applications</Typography>
          <Typography variant="body2" color="text.secondary">
            Client apps using the Setrox AI gateway
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setCreateOpen(true)}
        >
          New Application
        </Button>
      </Box>

      <Stack spacing={2}>
        {apps.map((a) => (
          <Card key={a.id}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <Box flex={1}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Typography variant="h6" fontWeight={600}>{a.name}</Typography>
                    <Chip label={a.slug} size="small" variant="outlined" />
                    {!a.isActive && <Chip label="DISABLED" size="small" color="default" />}
                  </Box>
                  {a.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {a.description}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary">
                    {a.totalUsers} users · {a.totalRequests} requests · {a.freeQuotaPerDay}/day free quota
                  </Typography>
                </Box>
                <Switch
                  checked={a.isActive}
                  onChange={() => toggle.mutate(a.id)}
                  color="primary"
                />
                <Tooltip title="Regenerate API key (invalidates old key)">
                  <IconButton
                    onClick={async () => {
                      const result = await regen.mutateAsync(a.id);
                      setNewKey(result.apiKey);
                    }}
                    color="warning"
                  >
                    <KeyOff />
                  </IconButton>
                </Tooltip>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Stack>

      {createOpen && (
        <CreateAppDialog
          onClose={() => setCreateOpen(false)}
          onCreated={(key) => {
            setCreateOpen(false);
            setNewKey(key);
            qc.invalidateQueries({ queryKey: ['apps'] });
          }}
        />
      )}

      <Dialog open={!!newKey} onClose={() => setNewKey(null)}>
        <DialogTitle>API Key Generated</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Save this key now. You won't be able to see it again.
          </Alert>
          <TextField
            value={newKey ?? ''}
            fullWidth
            InputProps={{ readOnly: true }}
            multiline
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => copy(newKey ?? '')} startIcon={<ContentCopy />}>
            {copied ? 'Copied!' : 'Copy'}
          </Button>
          <Button onClick={() => setNewKey(null)} variant="contained">Done</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function CreateAppDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (key: string) => void }) {
  const [form, setForm] = useState({ slug: '', name: '', description: '', freeQuotaPerDay: 5 });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => (await api.post('/v1/admin/applications', form)).data as CreateResult,
    onSuccess: (data) => onCreated(data.application.apiKey),
    onError: (err: any) => setError(err.response?.data?.error?.message ?? 'Create failed'),
  });

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>New Application</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Slug"
            placeholder="e.g. healthlens, fittrack"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
            fullWidth
            helperText="lowercase, no spaces"
          />
          <TextField
            label="Display name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            fullWidth
          />
          <TextField
            label="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            fullWidth
            multiline
            rows={2}
          />
          <TextField
            label="Free quota per day"
            type="number"
            value={form.freeQuotaPerDay}
            onChange={(e) => setForm({ ...form, freeQuotaPerDay: Number(e.target.value) })}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={() => create.mutate()}
          variant="contained"
          disabled={!form.slug || !form.name || create.isPending}
        >
          {create.isPending ? 'Creating...' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
