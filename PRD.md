# FocusPal - Product Requirements Document (PRD)

**Version:** 2.0  
**Last Updated:** 2024-04-01  
**Status:** Active Development

---

## 1. Product Vision

FocusPal is an intelligent, minimalist productivity companion that lives on your screen as an ambient, non-intrusive widget. It helps users manage time-blocked tasks, maintain focus, and build productive habits through smart automation and AI-powered insights.

### Core Philosophy
- Ambient presence, not intrusive
- Smart automation over manual tracking
- Visual clarity through priority-based design
- Adaptive to user behavior
- Cloud-first for seamless cross-device experience

### Account System
**Required:** Users must create an account to use FocusPal

**Benefits:**
- Cloud data sync across devices
- AI model training on user data
- Personalized insights and recommendations
- Secure backup of tasks and history
- Cross-platform continuity

**Authentication:**
- Email + Password
- Google OAuth (optional)
- GitHub OAuth (optional)
- Password reset via email

---

## 2. Widget States & Behavior

### 2.1 Dot State (Idle)
**When:** No active task running

**Appearance:**
- Small circular dot (44x44px)
- Subtle purple glow
- 70-80% opacity
- Draggable anywhere on screen

**Interactions:**
- Click: Expand to full widget
- Click + Hold + Drag: Move position
- Right-click: Quick actions menu
- Double-click: Quick add task

### 2.2 Pill State (Active Task)
**When:** Task is running

**Appearance:**
- Elongated capsule shape (~120x44px)
- Shows: Task name + Running timer
- Priority-based colored glow
- 90% opacity
- Smooth transition from dot

**Display Format:**
```
┌───────────┐
│ Deep Work |
|   25:30   │
└───────────┘
```

**Interactions:**
- Click: Expand to full widget
- Click + Hold + Drag: Move position
- Right-click: Quick actions (pause, skip, complete)

**Auto-collapse:**
- Returns to dot when task ends
- Smooth animation transition


### 2.3 Lookup Card State (Word Definition)
**When:** User selects text (feature enabled)

**Appearance:**
- Two-column card (480x220px)
- Left: English definition
- Right: Tamil translation
- Smooth transition from pill/dot

**Display Format:**
```
┌──────────────────────────────────────┐
│ "productivity"              [×]      │
├──────────────┬───────────────────────┤
│ Definition   │ Tamil Translation     │
├──────────────┼───────────────────────┤
│              │                       │
│ noun         │ உற்பத்தித்திறன்      │
│              │                       │
│ The state or │ (uṟpattittiṟaṉ)      │
│ quality of   │                       │
│ producing    │ ஒரு குறிப்பிட்ட      │
│ something,   │ காலத்தில் உற்பத்தி    │
│ especially   │ செய்யப்படும் அளவு     │
│ crops.       │                       │
│              │                       │
└──────────────┴───────────────────────┘
```

**Interactions:**
- Auto-opens when text selected (if enabled)
- Click × or deselect text: Returns to pill/dot
- Draggable by header
- Toggle button on pill to enable/disable

**Technical:**
- Monitors clipboard/selection (Linux primary selection)
- Always active (no toggle)
- Triggers on text <40 characters
- Shows floating icon near selection (Grammarly-style)
- User clicks icon to activate lookup
- Fetches from Free Dictionary API (English)
- Fetches from MyMemory API (Tamil translation)
- Debounced to avoid excessive API calls

### 2.4 Expanded Widget State
**When:** User clicks dot/pill

**Appearance:**
- Full card view (320x200px)
- Shows current task, progress, next task
- Draggable by header or drag handle
- Can be moved anywhere on screen

**Critical Fix:**
- Widget MUST remain draggable when expanded
- Drag handle at top + entire header is draggable
- Position persists across states

---

## 3. Word Lookup Feature

### 3.1 Purpose
Help users learn new words while reading by providing instant definitions and Tamil translations.

### 3.2 Activation
**Always Enabled:**
- Word lookup is always active (no toggle needed)
- Runs in background whenever app is running
- Cannot be disabled by user
- Core feature of FocusPal

**Visual Indicator:**
- Small 📖 icon in widget header (always visible)
- Indicates feature is active
- Tooltip: "Word lookup active"

### 3.3 How It Works

**1. Text Selection Detection**
- Monitor clipboard/selection changes
- Linux: Use primary selection (`clipboard.readText('selection')`)
- Windows: Use standard clipboard
- Trigger only if:
  - Text length < 40 characters
  - Text is a single word (no multi-word phrases)
  - Feature is enabled

**2. Floating Icon Display (Grammarly-style)**
- When text is selected, show floating icon near selection
- Icon: 📖 or custom FocusPal icon
- Position: Slightly above and to the right of selection
- Appears with fade-in animation (200ms)
- Disappears when:
  - Text is deselected
  - User clicks elsewhere
  - 5 seconds of inactivity

**Icon Appearance:**
```
Selected text here
                 [📖]  ← Floating icon
```

**3. Activation on Click**
- User clicks the floating icon
- Widget transforms to lookup card (480x220px)
- Fetches definition and translation
- Icon disappears

**4. Definition Fetch**
- English Definition: Free Dictionary API
  - `https://api.dictionaryapi.dev/api/v2/entries/en/{word}`
- Tamil Translation: MyMemory API
  - `https://api.mymemory.translated.net/get?q={word}&langpair=en|ta`

**5. Display**
- Widget transforms to lookup card (480x220px)
- Two-column layout
- Returns to previous state (pill/dot) when:
  - User clicks close button (×)
  - User clicks outside the card
  - 30 seconds of inactivity

**6. Caching**
- Default cache: 20 words
- User configurable: 10-100 words
- LRU (Least Recently Used) eviction
- Stored locally for quick access
- Synced to cloud for cross-device

### 3.4 Technical Implementation

**main.js:**
```javascript
// Clipboard monitoring
let clipboardInterval = null;
let lastSelection = '';

function startClipboardMonitor() {
  const { clipboard } = require('electron');
  clipboardInterval = setInterval(() => {
    const text = clipboard.readText('selection'); // Linux primary
    if (text && text !== lastSelection && text.length < 40 && text.split(' ').length === 1) {
      lastSelection = text;
      // Get cursor position for icon placement
      const cursorPos = screen.getCursorScreenPoint();
      widgetWindow?.webContents.send('word-selected', { text, position: cursorPos });
    } else if (!text && lastSelection) {
      lastSelection = '';
      widgetWindow?.webContents.send('word-cleared');
    }
  }, 500); // Check every 500ms
}

// IPC handlers
ipcMain.on('widget-lookup-open', () => {
  if (!widgetWindow) return;
  const [cx, cy] = widgetWindow.getPosition();
  widgetWindow.setBounds({ x: cx, y: cy, width: 480, height: 220 }, true);
});

ipcMain.on('widget-lookup-close', () => {
  // Return to previous state (pill or dot)
  const hasActiveTask = store.get('hasActiveTask', false);
  if (hasActiveTask) {
    widgetWindow?.webContents.send('widget-collapse'); // Back to pill
  } else {
    widgetWindow?.webContents.send('widget-collapse'); // Back to dot
  }
});
```

**preload.js:**
```javascript
// Add to exposed API
onWordSelected: (cb) => ipcRenderer.on('word-selected', (e, data) => cb(data)),
onWordCleared: (cb) => ipcRenderer.on('word-cleared', cb),
```

**widget.html:**
```javascript
// Floating icon element
let floatingIcon = null;

function createFloatingIcon(word, position) {
  // Create floating icon near cursor
  floatingIcon = document.createElement('div');
  floatingIcon.className = 'floating-lookup-icon';
  floatingIcon.innerHTML = '📖';
  floatingIcon.style.position = 'fixed';
  floatingIcon.style.left = (position.x + 10) + 'px';
  floatingIcon.style.top = (position.y - 30) + 'px';
  floatingIcon.style.cursor = 'pointer';
  floatingIcon.style.opacity = '0';
  floatingIcon.style.transition = 'opacity 0.2s';
  
  floatingIcon.onclick = async () => {
    // Fetch definition and translation
    const definition = await fetchDefinition(word);
    const translation = await fetchTranslation(word);
    
    // Show lookup card
    showLookupCard(word, definition, translation);
    window.fp.send('widget-lookup-open');
    
    // Remove icon
    removeFloatingIcon();
  };
  
  document.body.appendChild(floatingIcon);
  
  // Fade in
  setTimeout(() => {
    floatingIcon.style.opacity = '1';
  }, 10);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    removeFloatingIcon();
  }, 5000);
}

function removeFloatingIcon() {
  if (floatingIcon) {
    floatingIcon.remove();
    floatingIcon = null;
  }
}

// Listen for word selection (always active)
window.fp.onWordSelected(async (data) => {
  // Show floating icon
  createFloatingIcon(data.text, data.position);
});

window.fp.onWordCleared(() => {
  removeFloatingIcon();
});
```

**CSS for Floating Icon:**
```css
.floating-lookup-icon {
  width: 32px;
  height: 32px;
  background: var(--accent);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  z-index: 9999;
  user-select: none;
}

.floating-lookup-icon:hover {
  transform: scale(1.1);
  box-shadow: 0 4px 12px rgba(124,108,252,0.5);
}
```

### 3.5 Error Handling
- Word not found: Show "No definition found"
- API error: Show "Unable to fetch definition"
- Network error: Show "Check internet connection"
- Fallback: Show basic message
- Icon positioning: Adjust if near screen edge

### 3.6 Privacy & Performance
- Lookups synced to user's cloud account
- API calls debounced (max 1 per second)
- Cache recent lookups (default: 20 words, configurable 10-100)
- Cache synced across user's devices
- Always running in background

**Settings:**
```
┌─────────────────────────────┐
│ Word Lookup Settings        │
├─────────────────────────────┤
│                             │
│ ℹ️ Word lookup is always    │
│    active                   │
│                             │
│ Cache Size: [20] words      │
│ (10-100)                    │
│                             │
│ [Clear Cache]               │
│                             │
└─────────────────────────────┘
```

---

## 4. Task System

### 4.1 Task Properties
```javascript
{
  id: string,
  name: string,
  startTime: string,
  endTime: string,
  priority: 'critical' | 'high' | 'medium' | 'low' | 'info' | 'personal',
  recurring: 'none' | 'daily' | 'weekdays' | 'weekends' | 'custom',
  status: 'pending' | 'active' | 'completed' | 'partial' | 'skipped',
  completionNote: string,
  createdAt: timestamp,
  completedAt: timestamp
}
```

### 4.2 Task Lifecycle

**1. Task Scheduled**
- Task exists in schedule
- Widget shows in "up next" section

**2. Task Start Time Arrives**
- In-app notification (NOT OS notification)
- Confirmation dialog appears


**Start Dialog:**
```
┌─────────────────────────────┐
│ 🔔 Ready to start?          │
│                             │
│ Deep Work Session           │
│ 09:00 - 11:00 (2h)         │
│ Priority: 🔴 Critical       │
│                             │
│ [Start Now]  [+5m]  [Skip] │
└─────────────────────────────┘
```

**3. Task Running**
- Widget transforms to pill shape
- Shows task name + live timer
- Colored glow based on priority
- Optional: Play start sound (user audio file)

**4. Task Ending Soon (<5 min)**
- Pulsing glow animation
- Gentle alert sound (optional)

**5. Task End Time Arrives**
- Completion dialog appears
- Optional: Play completion sound


**Completion Dialog:**
```
┌─────────────────────────────┐
│ How did it go?              │
│                             │
│ Deep Work Session           │
│ Planned: 2h | Actual: 2h 5m│
│                             │
│ [✓ Completed]               │
│ [⚠ Partially Done]         │
│ [✗ Didn't Start]           │
│                             │
│ Quick note (optional)       │
│ ┌─────────────────────────┐ │
│ │                         │ │
│ └─────────────────────────┘ │
│                             │
│ [Save]                      │
└─────────────────────────────┘
```

### 4.3 Recurring Tasks
**Current Issue:** Tasks are always recurring

**Fix Required:**
- Default: Non-recurring (one-time task)
- Add recurring options:
  - None (default)
  - Daily
  - Weekdays (Mon-Fri)
  - Weekends (Sat-Sun)
  - Custom (select days)
- Store recurring pattern with task
- Auto-generate instances based on pattern


---

## 5. Audio System

### 5.1 Custom Audio Files
**Supported Formats:** .mp3, .wav, .ogg, .m4a

**Audio Events:**
1. Task Start
2. Task End
3. Break Start
4. Break End
5. Task Ending Soon (5 min warning)

**Settings:**
```
┌─────────────────────────────┐
│ Audio Settings              │
├─────────────────────────────┤
│                             │
│ Task Start Sound            │
│ [Browse...] start.mp3       │
│ [Test] [Clear]              │
│                             │
│ Task End Sound              │
│ [Browse...] complete.mp3    │
│ [Test] [Clear]              │
│                             │
│ Break Reminder Sound        │
│ [Browse...] break.mp3       │
│ [Test] [Clear]              │
│                             │
│ Volume: ▓▓▓▓▓▓▓░░░ 70%     │
│                             │
│ [Use Default Sounds]        │
└─────────────────────────────┘
```

**Implementation:**
- Store audio file paths in settings
- Fallback to default system beep or app provided notification sound
- Volume control (0-100%)
- Test button to preview sound


---

## 6. Notification System

### 6.1 In-App Notifications Only
**Critical:** NO OS-level notifications

**Notification Types:**
1. Task start confirmation
2. Task completion prompt
3. Break reminder
4. EOD planning prompt
5. Streak milestone

**Design:**
- Appears within app window
- Slides in from widget
- Auto-dismiss after 30s (except confirmations)
- Sound plays with notification 

### 6.2 EOD Planning Prompt
**Trigger:** When user attempts to quit app

**Behavior:**
- In-app dialog (NOT OS notification)
- Appears before app closes
- Can be disabled in settings

```
┌─────────────────────────────┐
│ 🌙 End of Day               │
│                             │
│ Before you go...            │
│                             │
│ Today's Summary:            │
│ ✓ 5 tasks completed         │
│ ⚠ 2 partially done          │
│ ✗ 1 skipped                 │
│                             │
│ Plan tomorrow?              │
│                             │
│ [Yes, Plan]  [Just Quit]   │
│                             │
│ [ ] Don't show again        │
└─────────────────────────────┘
```


---

## 7. Pomodoro / Focus Mode

### 7.1 Focus Mode Features
**Purpose:** Enhanced concentration during deep work

**Activation:**
- Toggle in widget header
- Keyboard shortcut: Ctrl+Shift+F
- Auto-activate for "Critical" priority tasks (optional)

**When Active:**
- Widget minimizes to timer-only pill
- Hides "next task" preview
- Dims all non-essential UI
- Optional: Mute break reminders
- Optional: Block distracting websites (future)

### 7.2 Pomodoro Timer
**Integration with existing tasks:**

**Option A: Pomodoro Overlay**
- Works on top of any task
- 25 min work / 5 min break cycle
- After 4 cycles: 15 min long break
- Task continues, Pomodoro adds structure

**Option B: Pomodoro Task Type**
- Create task with "Pomodoro" mode
- Auto-splits into 25 min chunks
- Enforces break intervals
- Tracks completed pomodoros

**Settings:**
```
┌─────────────────────────────┐
│ Pomodoro Settings           │
├─────────────────────────────┤
│                             │
│ Work Duration: [25] minutes │
│ Short Break:   [5] minutes  │
│ Long Break:    [15] minutes │
│ Cycles before long: [4]     │
│                             │
│ [✓] Auto-start breaks       │
│ [✓] Auto-start next work    │
│ [ ] Strict mode (no skip)   │
│                             │
└─────────────────────────────┘
```


---

## 8. Analytics & Insights

### 8.1 Daily Summary
**Purpose:** Quick overview of productivity

**Data Points:**
- Tasks completed / total scheduled
- Total focus time (actual work time)
- Completion rate percentage
- Most productive time block
- Tasks by priority breakdown

**Display:**
```
┌─────────────────────────────┐
│ Today's Summary             │
│ April 1, 2024               │
├─────────────────────────────┤
│                             │
│ ✓ 5 / 8 tasks completed     │
│ ⏱ 6h 30m focus time         │
│ 📊 62% completion rate      │
│                             │
│ By Priority:                │
│ 🔴 2/2 Critical             │
│ 🟠 2/3 High                 │
│ 🟡 1/2 Medium               │
│ 🟢 0/1 Low                  │
│                             │
│ Peak: 9:00 AM - 11:00 AM   │
│                             │
│ [View Details]              │
└─────────────────────────────┘
```

**Access:**
- Widget → Summary button
- EOD prompt shows summary
- Settings → Analytics tab


### 8.2 Streak System
**Purpose:** Build consistency and motivation

**Streak Types:**

**1. Daily Streak**
- Consecutive days with >50% task completion
- Resets if day has <50% completion
- Visual indicator on widget

**2. Perfect Days**
- Days with 100% task completion
- Tracked separately
- Milestone celebrations

**3. Focus Streak**
- Consecutive days with >4h focus time
- Encourages deep work habit

**Display:**
```
┌─────────────────────────────┐
│ 🔥 Streaks                  │
├─────────────────────────────┤
│                             │
│ Daily Streak                │
│ 🔥🔥🔥🔥🔥🔥🔥 7 days        │
│                             │
│ Perfect Days                │
│ ⭐⭐⭐ 3 this month          │
│                             │
│ Focus Streak                │
│ 💪💪💪💪💪 5 days            │
│                             │
│ Next Milestone: 10 days     │
│ Keep it up!                 │
│                             │
└─────────────────────────────┘
```

**Milestones:**
- 7 days: "Week Warrior"
- 30 days: "Monthly Master"
- 100 days: "Century Club"
- 365 days: "Year Legend"

**Notifications:**
- In-app celebration when milestone reached
- Optional confetti animation
- Share achievement (future: social)


### 8.3 Weekly/Monthly Reports
**Auto-generated insights:**

**Weekly Report (Every Monday):**
- Last week's completion rate
- Total focus time
- Most productive day
- Improvement suggestions
- Week-over-week comparison

**Monthly Report (1st of month):**
- Monthly completion rate
- Total tasks completed
- Perfect days count
- Longest streak
- Priority distribution
- Time of day analysis

**Visualization:**
- Simple bar charts
- Heatmap calendar (GitHub-style)
- Trend lines
- Export as PDF/PNG

---

## 9. AI Integration Ideas

### 9.1 Smart Scheduling Assistant
**Purpose:** Optimize task placement

**Features:**
- Analyze past completion patterns
- Suggest best time slots for task types
- Predict task duration based on history
- Auto-adjust schedule when running late
- Detect overcommitment (too many tasks)

**Example:**
```
💡 AI Suggestion:
"You usually complete deep work tasks 
better in the morning. Move this task 
to 9:00 AM?"

[Apply]  [Dismiss]
```


### 9.2 Intelligent Break Timing
**Purpose:** Optimize rest periods

**Features:**
- Analyze focus patterns
- Suggest breaks before burnout
- Adapt break frequency to workload
- Detect when user is struggling (low completion rate)

**Example:**
```
💡 AI Notice:
"You've been working for 3 hours straight.
Your productivity typically drops after 
2.5 hours. Take a 10-minute break?"

[Yes, Break]  [15 More Minutes]
```

### 9.3 Natural Language Task Creation
**Purpose:** Faster task entry

**Features:**
- Parse natural language input
- Extract time, priority, duration
- Smart defaults based on context

**Examples:**
- "Deep work tomorrow 9am 2 hours" → Creates task
- "Meeting with team Friday 2pm" → Creates task
- "Lunch break daily 12pm 1 hour" → Creates recurring task


### 9.4 Productivity Insights
**Purpose:** Personalized recommendations

**Features:**
- Identify productivity patterns
- Suggest optimal work schedule
- Detect energy peaks/valleys
- Recommend task prioritization
- Warn about burnout risk

**Example Dashboard:**
```
┌─────────────────────────────┐
│ 🤖 AI Insights              │
├─────────────────────────────┤
│                             │
│ Your Peak Hours:            │
│ 🌅 9:00 AM - 11:30 AM       │
│                             │
│ Recommendation:             │
│ Schedule critical tasks in  │
│ morning. Your completion    │
│ rate is 85% vs 62% in PM.   │
│                             │
│ This Week:                  │
│ ⚠️ 3 tasks took 40% longer  │
│ than estimated. Consider    │
│ adding buffer time.         │
│                             │
│ Burnout Risk: Low ✓         │
│                             │
└─────────────────────────────┘
```

---

## 10. Authentication & Cloud Sync

### 10.1 Account System

**Required Login:**
- Users must create account before using app
- No offline/guest mode
- Account required for download/installation

**Registration Flow:**
```
┌─────────────────────────────┐
│ Welcome to FocusPal         │
│                             │
│ Create your account         │
│                             │
│ Email                       │
│ ┌─────────────────────────┐ │
│ │ you@example.com         │ │
│ └─────────────────────────┘ │
│                             │
│ Password                    │
│ ┌─────────────────────────┐ │
│ │ ••••••••                │ │
│ └─────────────────────────┘ │
│                             │
│ [Create Account]            │
│                             │
│ Or sign in with:            │
│ [Google] [GitHub]           │
│                             │
│ Already have account?       │
│ [Sign In]                   │
└─────────────────────────────┘
```

**Login Flow:**
```
┌─────────────────────────────┐
│ Welcome Back                │
│                             │
│ Email                       │
│ ┌─────────────────────────┐ │
│ │ you@example.com         │ │
│ └─────────────────────────┘ │
│                             │
│ Password                    │
│ ┌─────────────────────────┐ │
│ │ ••••••••                │ │
│ └─────────────────────────┘ │
│                             │
│ [Sign In]                   │
│                             │
│ [Forgot Password?]          │
│                             │
│ Or sign in with:            │
│ [Google] [GitHub]           │
│                             │
│ Don't have account?         │
│ [Create Account]            │
└─────────────────────────────┘
```

### 10.2 Cloud Data Storage

**What Gets Synced:**
- All tasks (past, present, future)
- Task completion history
- Streak data
- Analytics data
- User preferences/settings
- Audio file preferences (paths only)
- Word lookup cache
- AI learning data
- Widget position (per device)

**Sync Behavior:**
- Real-time sync when online
- Offline mode: Queue changes, sync when online
- Conflict resolution: Last write wins
- Background sync every 5 minutes

**Data Structure:**
```javascript
// User Account
{
  userId: string,
  email: string,
  displayName: string,
  createdAt: timestamp,
  lastLogin: timestamp,
  subscription: 'free' | 'premium',
  devices: Device[]
}

// Device
{
  deviceId: string,
  deviceName: string,
  platform: 'linux' | 'windows',
  lastSync: timestamp,
  widgetPosition: { x: number, y: number }
}
```

### 10.3 Backend Requirements

**Tech Stack:**
- Backend: Node.js + Express (or Firebase)
- Database: PostgreSQL (or Firestore)
- Authentication: JWT tokens
- Storage: Cloud storage for user data
- API: RESTful or GraphQL

**Endpoints:**
```
POST   /auth/register
POST   /auth/login
POST   /auth/logout
POST   /auth/refresh
POST   /auth/forgot-password
POST   /auth/reset-password

GET    /user/profile
PUT    /user/profile
DELETE /user/account

GET    /tasks
POST   /tasks
PUT    /tasks/:id
DELETE /tasks/:id

GET    /analytics/summary
GET    /analytics/streaks
GET    /analytics/history

GET    /settings
PUT    /settings

GET    /word-lookup/cache
POST   /word-lookup/cache
DELETE /word-lookup/cache/:word
```

### 10.4 Security

**Data Protection:**
- HTTPS only
- Password hashing (bcrypt)
- JWT token authentication
- Token refresh mechanism
- Rate limiting on API
- CORS protection

**Privacy:**
- User data encrypted at rest
- No data sharing with third parties
- GDPR compliant
- User can export all data
- User can delete account + all data

### 10.5 Offline Mode

**Limited Functionality:**
- View cached tasks
- Complete active task
- Basic timer functionality
- No new task creation
- No AI features
- No word lookup (unless cached)

**Sync on Reconnect:**
- Upload queued changes
- Download latest data
- Resolve conflicts
- Show sync status

---

## 11. Technical Architecture

### 11.1 Data Model Updates
```javascript
// User Settings
{
  userId: string,
  timeFormat: '12h' | '24h',
  wordLookup: {
    cacheSize: number // default: 20, range: 10-100
  },
  audioFiles: {
    taskStart: string,
    taskEnd: string,
    breakStart: string,
    volume: number
  },
  pomodoro: {
    workDuration: number,
    shortBreak: number,
    longBreak: number,
    cyclesBeforeLong: number
  },
  ai: {
    enabled: boolean,
    suggestions: boolean,
    autoSchedule: boolean
  }
}

// Widget State
{
  currentState: 'dot' | 'pill' | 'expanded' | 'lookup',
  position: { x: number, y: number },
  activeTask: Task | null,
  lookupWord: string | null,
  isOnline: boolean,
  lastSync: timestamp
}

// Word Lookup Cache
{
  word: string,
  definition: object,
  translation: string,
  timestamp: timestamp,
  accessCount: number
}
```


```javascript
// Task History
{
  taskId: string,
  date: timestamp,
  status: 'completed' | 'partial' | 'skipped',
  plannedDuration: number,
  actualDuration: number,
  completionNote: string,
  focusScore: number // 0-100
}

// Streak Data
{
  dailyStreak: number,
  lastCompletionDate: timestamp,
  perfectDays: number,
  focusStreak: number,
  milestones: string[]
}

// AI Learning Data
{
  taskPatterns: Map<taskType, completionStats>,
  productiveHours: number[],
  averageTaskDuration: Map<taskType, number>,
  breakEffectiveness: number
}
```

### 11.2 Performance Considerations
- Lazy load analytics data
- Cache AI predictions
- Debounce widget position updates
- Optimize audio file loading
- Background task history processing
- Efficient sync (delta updates only)
- Local-first architecture (offline capable)
- Background sync worker

---

## 12. Implementation Roadmap

### Phase 0: Foundation (Week 1-2)
- [ ] Set up backend infrastructure
- [ ] Implement authentication system
- [ ] Create database schema
- [ ] Build API endpoints
- [ ] Implement cloud sync logic
- [ ] Create login/registration UI
- [ ] Test authentication flow

### Phase 1: Core Fixes (Week 3-4)
- [ ] Fix recurring task system
- [ ] Make expanded widget draggable
- [ ] Remove fullscreen auto-hide
- [ ] Implement pill shape with timer
- [ ] Add dot ↔ pill transitions
- [ ] Implement word lookup feature
- [ ] Add clipboard monitoring (Linux primary selection)
- [ ] Integrate cloud sync for tasks

### Phase 2: Enhanced UX (Week 5-6)
- [ ] Scrollable time picker
- [ ] Priority-based color system
- [ ] Task confirmation dialogs
- [ ] Custom audio file support
- [ ] In-app notification system
- [ ] Word lookup UI polish
- [ ] Word lookup cache (20 default, configurable)
- [ ] Sync word lookup cache to cloud


### Phase 3: Analytics & Insights (Week 7-8)
- [ ] Daily summary
- [ ] Streak system
- [ ] Weekly/monthly reports
- [ ] Task history tracking
- [ ] Completion status tracking
- [ ] Sync analytics to cloud

### Phase 4: Focus Features (Week 9-10)
- [ ] Pomodoro timer
- [ ] Focus mode
- [ ] Break optimization
- [ ] Task templates
- [ ] Quick actions menu
- [ ] Sync templates to cloud

### Phase 5: AI Integration (Week 11-14)
- [ ] Smart scheduling
- [ ] Task duration prediction
- [ ] Productivity insights
- [ ] Natural language parsing
- [ ] Intelligent break timing
- [ ] Cloud-based AI model training

### Phase 6: Polish & Expansion (Week 15+)
- [ ] Multi-device sync testing
- [ ] Offline mode improvements
- [ ] Performance optimization
- [ ] Security audit
- [ ] Beta testing
- [ ] Public launch

---

## 13. Success Metrics

### User Engagement
- Daily active users
- Average session duration
- Tasks created per day
- Completion rate trends
- User retention rate
- Account creation rate

### Productivity Impact
- Average focus time per day
- Task completion rate
- Streak maintenance rate
- Time estimation accuracy

### Feature Adoption
- Pomodoro usage rate
- AI suggestion acceptance rate
- Custom audio usage
- Template usage
- Word lookup usage
- Cloud sync reliability

### Technical Metrics
- API response time
- Sync success rate
- Offline mode usage
- Error rates
- Crash reports


---

## 14. Open Questions

1. **AI Model:** Local (privacy) vs Cloud (powerful)? → Cloud-based for better performance
2. **Data Storage:** Local-only or optional cloud sync? → Required cloud sync with account
3. **Word Lookup:** Should it work with multi-word phrases? → No, single words only
4. **Tamil Translation:** Add more language options? → Future consideration
5. **Privacy:** How much data to collect for AI? → All task data with user consent
6. **Offline Mode:** Full functionality without internet? → Limited functionality
7. **Word Lookup Cache:** How many words to cache? → Default 20, configurable 10-100
8. **Backend:** Self-hosted or cloud service (Firebase/Supabase)?
9. **Pricing:** Free tier limits? Premium features?
10. **Data Export:** What format (JSON, CSV, PDF)?

---

## 15. Risks & Mitigations

### Technical Risks
- **Risk:** AI predictions inaccurate
- **Mitigation:** Start with simple rules, improve over time

- **Risk:** Performance issues with analytics
- **Mitigation:** Background processing, lazy loading

- **Risk:** Audio file compatibility
- **Mitigation:** Support multiple formats, fallback sounds

- **Risk:** Word lookup API rate limits
- **Mitigation:** Cache results, debounce requests, fallback to offline dictionary

- **Risk:** Clipboard monitoring privacy concerns
- **Mitigation:** Clear opt-in, only monitor when enabled, no data stored locally

- **Risk:** Backend downtime
- **Mitigation:** Offline mode, queue sync, status page

- **Risk:** Data loss during sync
- **Mitigation:** Conflict resolution, backup system, transaction logs

- **Risk:** Security breach
- **Mitigation:** Encryption, security audit, rate limiting, monitoring

### User Experience Risks
- **Risk:** Too many notifications
- **Mitigation:** Smart throttling, user controls

- **Risk:** Feature bloat
- **Mitigation:** Progressive disclosure, optional features

- **Risk:** Learning curve
- **Mitigation:** Onboarding flow, tooltips, tutorials

- **Risk:** Word lookup interrupting workflow
- **Mitigation:** Easy toggle, smart detection, auto-close timer

- **Risk:** Account requirement friction
- **Mitigation:** Quick OAuth signup, clear value proposition, smooth onboarding

- **Risk:** Sync conflicts confusing users
- **Mitigation:** Clear conflict resolution UI, last-write-wins default

### Business Risks
- **Risk:** Low user adoption
- **Mitigation:** Beta testing, user feedback, marketing

- **Risk:** High server costs
- **Mitigation:** Efficient data storage, caching, usage limits

- **Risk:** Competition
- **Mitigation:** Unique features (word lookup, AI), better UX

---

**Document Owner:** Development Team  
**Next Review:** 2024-04-15  
**Feedback:** Open for team input

---

## Appendix: Technology Stack

### Frontend (Electron App)
- Electron 28+
- HTML/CSS/JavaScript
- electron-store (local cache)
- axios (API calls)

### Backend
- Node.js + Express (or Firebase/Supabase)
- PostgreSQL (or Firestore)
- JWT authentication
- RESTful API

### External APIs
- Free Dictionary API (definitions)
- MyMemory API (translations)

### DevOps
- GitHub Actions (CI/CD)
- Docker (containerization)
- AWS/GCP/Vercel (hosting)
- Sentry (error tracking)

