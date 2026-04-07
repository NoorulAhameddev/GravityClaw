# 📱 Gravity Claw Mobile Companion

React Native (Expo) companion app that connects to Gravity Claw AI agent.

## Features

- **WebSocket Connection** - Real-time connection to Gravity Claw server
- **GPS Location** - Share phone location with the agent
- **Camera** - Capture photos on command
- **Screen Recording** - Record screen on command  
- **Push Notifications** - Receive alerts from the agent
- **Battery Status** - Share battery level with agent

## Quick Start

```bash
# 1. Navigate to the companion app
cd mobile-companion

# 2. Install dependencies
npm install

# 3. Start the development server
npx expo start

# 4. Run on device/emulator
# Press 'a' for Android
# Press 'i' for iOS
```

## Configuration

Edit `App.tsx` to change the server URL:

```typescript
const SERVER_URL = 'http://YOUR_SERVER_IP:3000';
```

Replace `YOUR_SERVER_IP` with your computer's local IP address (not localhost).

## Required Server Configuration

Make sure Gravity Claw server has mobile channel enabled in `.env`:

```env
MOBILE_CHANNEL_ENABLED=true
```

## Usage

1. **Start Gravity Claw server**
2. **Run the companion app** on your phone
3. **Connect** by entering server URL and tapping Connect
4. The agent can now control your phone remotely!

## Available Agent Tools

Once connected, these tools become available to the AI agent:

- `get_mobile_location` - Get GPS coordinates
- `request_camera_capture` - Take a photo
- `request_screen_recording` - Record screen
- `send_push_notification` - Send alert to phone
- `get_mobile_battery_status` - Check battery level

## Permissions Required

### iOS
- Camera
- Location
- Microphone (for screen recording)

### Android
- Camera
- Location
- Storage
- Notifications

## Building for Production

```bash
# Generate native projects
npx expo prebuild

# Build Android APK
cd android && ./gradlew assembleRelease

# Or build iOS
cd ios && xcodebuild
```

## API Endpoints Used

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mobile` | WebSocket | Main connection |
| `/mobile/location` | POST | Send GPS location |
| `/mobile/device-info` | POST | Send device info |
| `/mobile/battery` | POST | Send battery status |
| `/mobile/upload/camera` | POST | Upload photo |
| `/mobile/upload/screen` | POST | Upload recording |

## Troubleshooting

- **Can't connect?** Make sure server URL uses local IP, not localhost
- **Permissions denied?** Check app permissions in phone settings
- **Camera not working?** Ensure camera permission is granted
