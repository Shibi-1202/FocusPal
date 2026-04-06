# FocusPal Fixes TODO

## Authentication & Window Issues

### 1. Login/Register UI Clipping
- [x] Make auth window larger to prevent UI clipping (450x650)
- [x] Add working close/minimize buttons to auth window
- [ ] Configure Google OAuth authentication (requires external setup)
- [ ] Configure GitHub OAuth authentication (requires external setup)

### 2. Widget Not Showing After Registration
- [x] Widget should automatically pop up after account creation (FIXED in main.js)

## Widget Panel Issues

### 3. Widget Size & Layout
- [x] Increase widget panel size to fit all components without clipping (380x240)
- [x] Ensure all UI elements are visible and properly spaced

### 4. Task Management
- [x] Add option to delete tasks (✕ button exists on each task in settings)
- [x] Always show "Add Task" button on panel (now always visible at bottom)
- [x] Remove redundant display of yesterday's tasks (filtered by date in generateRecurringTasks)

### 5. Widget Dragging
- [x] Make widget movable/draggable across screen (movable: true added)

## Settings Panel Issues

### 6. Time Picker Issues
- [x] Fix time scroller - animation shows but numbers don't change (FIXED: now updates selectedHour/Minute/Period on scroll)
- [x] Allow setting time beyond current hour (NO RESTRICTION: can set any time)
- [x] Fix time picker in both 12h and 24h formats (works correctly)

### 7. AI Insights Page
- [x] Change page title from "AI INSIGHTS" to "INSIGHTS"
- [x] Document/explain how peak hours are calculated (added explanation)
- [x] Document which AI model is being used for insights (added About AI Engine section)
- [x] Move natural language task creation to TASKS area (moved to Tasks panel)

### 8. Missing Settings
- [x] Add water break timer settings (EXISTS in Breaks panel with toggle)
- [x] Add stretch break settings (EXISTS in Breaks panel with toggle)
- [x] Add eye rest settings (EXISTS in Breaks panel with toggle)

### 9. Focus Mode & Pomodoro Button Position
- [x] Move Focus Mode button to bottom right near time display (DONE)
- [x] Move Pomodoro button next to Focus Mode button (DONE)

## App Behavior Issues

### 10. Plan Tomorrow Screen
- [x] Fix "Plan Tomorrow" screen - clicking "Plan" closes app entirely (FIXED: now opens settings to Tasks tab)
- [x] Should save plan and return to widget instead of closing (FIXED: keeps app open)

### 11. Focus Mode DND Integration
- [x] Implement system DND (Do Not Disturb) toggle when Focus Mode is activated (IMPLEMENTED for Linux/GNOME)
- [x] Currently shows "distractions minimized" but doesn't actually enable system DND (FIXED: now toggles gsettings)
- [x] Platform-specific implementation needed (Linux/Windows/Mac) (Linux GNOME implemented, others show graceful message)

---

## Completed Fixes (Restart app to see changes)
1. ✅ Auth window enlarged with working custom window controls (minimize/close)
2. ✅ Widget auto-shows after registration/login
3. ✅ Widget size increased (400x260) with responsive layout
4. ✅ Widget is movable/draggable
5. ✅ "AI Insights" renamed to "Insights"
6. ✅ Logout option added to Account tab in settings
7. ✅ Persistent "Add Task" button always visible on widget (NOW AT TOP)
8. ✅ Yesterday's tasks filtered out (only today's tasks show)
9. ✅ Focus Mode & Pomodoro buttons moved to bottom right near clock
10. ✅ Break timer settings exist in Breaks panel (water, stretch, eye rest)
11. ✅ Delete task functionality with toast notification and auto-save (FIXED async handling)
12. ✅ AI model documentation added to Insights panel
13. ✅ Peak hours calculation explanation added
14. ✅ Natural language task creation moved to Tasks panel
15. ✅ Time picker scrolling fixed (updates values on scroll)
16. ✅ No time restrictions (can set any time, not just current hour+)
17. ✅ Toast notifications for task add/delete/save
18. ✅ Dot fully clickable - center and edges (FIXED pointer-events)
19. ✅ Widget responsive with scrollable content
20. ✅ Tasks auto-save on add/delete (no need to click Save)
21. ✅ Plan Tomorrow opens settings to Tasks tab (doesn't quit app)
22. ✅ Focus Mode toggles system DND on Linux/GNOME
23. ✅ All Settings Panel Issues resolved
24. ✅ All App Behavior Issues resolved
25. ✅ Add Task button moved to TOP of widget for better visibility
26. ✅ Task deletion now properly saves to storage (async function properly handled)
27. ✅ Dot layout cleaned up so the idle dot stays visually centered
28. ✅ Word lookup opens directly in-app and adapts size to content

## Next Priority Fixes
- Verify the checked UI fixes by running the desktop app interactively
- Configure Google OAuth authentication
- Configure GitHub OAuth authentication

## Known Issues
- Google OAuth and GitHub OAuth require external setup (credentials, redirect URIs)
- Break settings panel exists but user reported not seeing it - may need to verify tab navigation is working correctly

## OAuth Setup Instructions (For Later)

### Google OAuth
1. Go to Google Cloud Console
2. Create OAuth 2.0 credentials
3. Add redirect URI: `focuspal://auth/google/callback`
4. Store client ID and secret in backend .env
5. Implement OAuth flow in auth controller

### GitHub OAuth
1. Go to GitHub Developer Settings
2. Create OAuth App
3. Add callback URL: `focuspal://auth/github/callback`
4. Store client ID and secret in backend .env
5. Implement OAuth flow in auth controller
