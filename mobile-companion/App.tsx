import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, TextInput, Alert, ScrollView, Switch, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import * as ScreenCapture from 'expo-screen-capture';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SERVER_URL = 'http://YOUR_SERVER_IP:3000';

interface MobileState {
  connected: boolean;
  serverUrl: string;
  userId: string;
  location: { latitude: number; longitude: number } | null;
  batteryLevel: number | null;
  isCharging: boolean;
}

export default function App() {
  const [serverUrl, setServerUrl] = useState(SERVER_URL);
  const [userId, setUserId] = useState('user-1');
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [recording, setRecording] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [autoLocation, setAutoLocation] = useState(true);
  const cameraRef = useRef<any>(null);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${msg}`, ...prev.slice(0, 50)]);
  };

  const connect = () => {
    try {
      addLog(`Connecting to ${serverUrl}/mobile?userId=${userId}...`);
      const socket = new WebSocket(`${serverUrl}/mobile?userId=${userId}`);

      socket.onopen = () => {
        setConnected(true);
        setWs(socket);
        addLog('✅ Connected to Gravity Claw!');
        sendDeviceInfo();
      };

      socket.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          addLog(`📩 Received: ${data.type}`);
          
          switch (data.type) {
            case 'message':
              addLog(`💬 Message: ${data.text}`);
              break;
            case 'action':
              handleAction(data.action);
              break;
            case 'push_notification':
              showNotification(data.title, data.body);
              break;
          }
        } catch (e) {
          addLog(`❌ Parse error: ${e}`);
        }
      };

      socket.onclose = () => {
        setConnected(false);
        setWs(null);
        addLog('❌ Disconnected');
      };

      socket.onerror = (err) => {
        addLog(`❌ WebSocket error: ${err}`);
      };
    } catch (e) {
      addLog(`❌ Connection failed: ${e}`);
    }
  };

  const disconnect = () => {
    if (ws) {
      ws.close();
      setWs(null);
      setConnected(false);
    }
  };

  const send = (data: any) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  };

  const sendDeviceInfo = async () => {
    const info = {
      type: 'device_info',
      info: {
        platform: Platform.OS,
        osVersion: Platform.Version,
        appVersion: '1.0.0',
        model: Device.modelName || 'Unknown'
      }
    };
    send(info);
    addLog('📱 Sent device info');
  };

  const sendBatteryStatus = (level: number, charging: boolean) => {
    send({
      type: 'battery',
      level,
      isCharging: charging
    });
  };

  const handleAction = async (action: string) => {
    addLog(`🎬 Action requested: ${action}`);
    
    switch (action) {
      case 'camera':
        setCameraVisible(true);
        break;
      case 'record':
        startScreenRecording();
        break;
      case 'stop_recording':
        stopScreenRecording();
        break;
      case 'gps_refresh':
        sendLocation();
        break;
    }
  };

  const sendLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        addLog('❌ Location permission denied');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      const newLocation = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude
      };
      setLocation(newLocation);
      
      send({
        type: 'location',
        ...newLocation,
        accuracy: loc.coords.accuracy
      });
      addLog(`📍 Location sent: ${newLocation.latitude.toFixed(4)}, ${newLocation.longitude.toFixed(4)}`);
    } catch (e) {
      addLog(`❌ Location error: ${e}`);
    }
  };

  const captureCamera = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({
          base64: true,
          quality: 0.7
        });
        
        if (photo?.base64) {
          await fetch(`${serverUrl}/mobile/upload/camera`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              image: photo.base64,
              filename: `capture_${Date.now()}.jpg`
            })
          });
          addLog('📷 Camera capture uploaded');
        }
      } catch (e) {
        addLog(`❌ Camera error: ${e}`);
      }
    }
    setCameraVisible(false);
  };

  const startScreenRecording = async () => {
    try {
      setRecording(true);
      addLog('🎬 Screen recording started');
      await ScreenCapture.preventScreenCaptureAsync();
    } catch (e) {
      addLog(`❌ Recording error: ${e}`);
    }
  };

  const stopScreenRecording = async () => {
    try {
      setRecording(false);
      await ScreenCapture.allowScreenCaptureAsync();
      addLog('⏹️ Screen recording stopped');
    } catch (e) {
      addLog(`❌ Stop error: ${e}`);
    }
  };

  const showNotification = async (title: string, body: string) => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: { title, body },
        trigger: null
      });
    } catch (e) {
      addLog(`❌ Notification error: ${e}`);
    }
  };

  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, []);

  useEffect(() => {
    if (autoLocation && connected) {
      const interval = setInterval(sendLocation, 30000);
      return () => clearInterval(interval);
    }
  }, [autoLocation, connected]);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.header}>
        <Text style={styles.title}>🦾 Gravity Claw Companion</Text>
        
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: connected ? '#4CAF50' : '#f44336' }]} />
          <Text style={styles.statusText}>{connected ? 'Connected' : 'Disconnected'}</Text>
        </View>

        <View style={styles.inputRow}>
          <Text style={styles.label}>Server:</Text>
          <TextInput
            style={styles.input}
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="http://192.168.1.100:3000"
          />
        </View>

        <View style={styles.inputRow}>
          <Text style={styles.label}>User ID:</Text>
          <TextInput
            style={styles.input}
            value={userId}
            onChangeText={setUserId}
            placeholder="user-1"
          />
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, connected ? styles.disconnectBtn : styles.connectBtn]}
            onPress={connected ? disconnect : connect}
          >
            <Text style={styles.buttonText}>{connected ? 'Disconnect' : 'Connect'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.toggleRow}>
          <Text style={styles.label}>Auto-send Location:</Text>
          <Switch value={autoLocation} onValueChange={setAutoLocation} />
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoText}>📍 Location: {location ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : 'Unknown'}</Text>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.actionButton} onPress={sendLocation}>
            <Text style={styles.buttonText}>📍 Get Location</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionButton} onPress={() => setCameraVisible(true)}>
            <Text style={styles.buttonText}>📷 Camera</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <ScrollView style={styles.logs}>
        <Text style={styles.logsTitle}>📋 Logs</Text>
        {logs.map((log, i) => (
          <Text key={i} style={styles.logText}>{log}</Text>
        ))}
      </ScrollView>

      {cameraVisible && (
        <View style={styles.cameraContainer}>
          <CameraView ref={cameraRef} style={styles.camera} facing="back">
            <View style={styles.cameraControls}>
              <TouchableOpacity style={styles.captureBtn} onPress={captureCamera}>
                <Text style={styles.captureText}>📷</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setCameraVisible(false)}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>
          </CameraView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    paddingTop: 60,
  },
  header: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 20,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 16,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    color: '#fff',
    width: 80,
    fontSize: 14,
  },
  input: {
    flex: 1,
    backgroundColor: '#16213e',
    color: '#fff',
    padding: 10,
    borderRadius: 8,
    fontSize: 14,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginVertical: 10,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    minWidth: 120,
  },
  connectBtn: {
    backgroundColor: '#4CAF50',
  },
  disconnectBtn: {
    backgroundColor: '#f44336',
  },
  actionButton: {
    backgroundColor: '#0f3460',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 10,
    paddingHorizontal: 20,
  },
  infoRow: {
    padding: 10,
  },
  infoText: {
    color: '#aaa',
    fontSize: 12,
  },
  logs: {
    flex: 1,
    backgroundColor: '#0f0f1a',
    padding: 15,
    margin: 10,
    borderRadius: 8,
  },
  logsTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  logText: {
    color: '#888',
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  cameraContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  cameraControls: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 50,
  },
  captureBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureText: {
    fontSize: 30,
  },
  closeBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f44336',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
});
