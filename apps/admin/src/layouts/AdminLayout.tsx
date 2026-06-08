import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  AppBar, Toolbar, Typography, Box, Drawer, List, ListItem, ListItemButton,
  ListItemIcon, ListItemText, Divider, IconButton, Chip,
} from '@mui/material';
import {
  Dashboard, Power, Apps, People, Logout, DarkMode, Menu as MenuIcon,
} from '@mui/icons-material';
import { useState } from 'react';
import { setToken } from '../api/client';
import { useNavigate } from 'react-router-dom';

const NAV = [
  { to: '/', label: 'Dashboard', icon: <Dashboard /> },
  { to: '/providers', label: 'AI Providers', icon: <Power /> },
  { to: '/applications', label: 'Applications', icon: <Apps /> },
  { to: '/users', label: 'Users', icon: <People /> },
];

const DRAWER_WIDTH = 240;

export function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    setToken(null);
    navigate('/login');
  };

  const drawer = (
    <Box>
      <Toolbar sx={{ px: 3 }}>
        <Typography variant="h6" fontWeight={700} color="primary">
          Setrox
        </Typography>
        <Chip label="ADMIN" size="small" sx={{ ml: 1 }} color="primary" variant="outlined" />
      </Toolbar>
      <Divider />
      <List>
        {NAV.map((item) => (
          <ListItem key={item.to} disablePadding>
            <ListItemButton
              component={Link}
              to={item.to}
              selected={location.pathname === item.to}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <Divider />
      <List>
        <ListItem disablePadding>
          <ListItemButton onClick={handleLogout}>
            <ListItemIcon><Logout /></ListItemIcon>
            <ListItemText primary="Sign out" />
          </ListItemButton>
        </ListItem>
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { sm: `${DRAWER_WIDTH}px` },
          bgcolor: 'background.paper',
          borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            sx={{ mr: 2, display: { sm: 'none' } }}
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1, color: 'text.primary' }}>
            {NAV.find((n) => n.to === location.pathname)?.label ?? 'Setrox Admin'}
          </Typography>
          <IconButton color="primary">
            <DarkMode />
          </IconButton>
        </Toolbar>
      </AppBar>
      <Box component="nav" sx={{ width: { sm: DRAWER_WIDTH }, flexShrink: { sm: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: DRAWER_WIDTH },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: DRAWER_WIDTH },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      <Box component="main" sx={{ flexGrow: 1, p: 3, width: { sm: `calc(100% - ${DRAWER_WIDTH}px)` } }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}
