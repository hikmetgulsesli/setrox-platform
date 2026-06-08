import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Card, CardContent, Typography, TextField, MenuItem, Chip,
  CircularProgress, Table, TableBody, TableCell, TableHead, TableRow, TableContainer,
} from '@mui/material';
import { api } from '../api/client';

interface User {
  id: string;
  externalUserId: string;
  email: string | null;
  displayName: string | null;
  isPremium: boolean;
  appSlug: string;
  appName: string;
  lastSeenAt: string | null;
  createdAt: string;
}

export function UsersPage() {
  const [appFilter, setAppFilter] = useState<string>('');
  const [search, setSearch] = useState('');

  const { data: apps } = useQuery<{ applications: Array<{ slug: string; name: string }> }>({
    queryKey: ['apps'],
    queryFn: async () => (await api.get('/v1/admin/applications')).data,
  });

  const { data, isLoading } = useQuery<{ users: User[] }>({
    queryKey: ['users', appFilter, search],
    queryFn: async () => {
      const params: Record<string, string> = { limit: '200' };
      if (appFilter) params.appId = appFilter;
      if (search) params.search = search;
      const res = await api.get('/v1/admin/users', { params });
      return res.data;
    },
  });

  if (isLoading) {
    return <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>;
  }
  const users = data?.users ?? [];

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>Users</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        All registered users across applications
      </Typography>

      <Box display="flex" gap={2} mb={3}>
        <TextField
          select
          label="Application"
          value={appFilter}
          onChange={(e) => setAppFilter(e.target.value)}
          sx={{ minWidth: 200 }}
          size="small"
        >
          <MenuItem value="">All apps</MenuItem>
          {apps?.applications.map((a) => (
            <MenuItem key={a.slug} value={a.slug}>{a.name}</MenuItem>
          ))}
        </TextField>
        <TextField
          label="Search email / external id"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="small"
          sx={{ flex: 1, maxWidth: 400 }}
        />
      </Box>

      <Card>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Email</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>App</TableCell>
                <TableCell>Plan</TableCell>
                <TableCell>Last Seen</TableCell>
                <TableCell>Created</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <Typography variant="body2" color="text.secondary" sx={{ py: 4 }}>
                      No users found
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {users.map((u) => (
                <TableRow key={u.id} hover>
                  <TableCell>
                    <Typography variant="body2">{u.email ?? '-'}</Typography>
                    <Typography variant="caption" color="text.secondary">{u.externalUserId}</Typography>
                  </TableCell>
                  <TableCell>{u.displayName ?? '-'}</TableCell>
                  <TableCell>
                    <Chip label={u.appSlug} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={u.isPremium ? 'PRO' : 'Free'}
                      size="small"
                      color={u.isPremium ? 'primary' : 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    {u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleString() : 'Never'}
                  </TableCell>
                  <TableCell>
                    {new Date(u.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Box>
  );
}
