// ═══════════════════════════════════════════════════════════════
// NexusCRM Mobile — React Native (Expo)
// Single file: App.js
// Run: npx expo start
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  FlatList, Modal, ActivityIndicator, Alert, StyleSheet,
  StatusBar, SafeAreaView, KeyboardAvoidingView, Platform,
  RefreshControl, Dimensions
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

// ── CONFIG ────────────────────────────────────────────────────
const API = `${process.env.API_URL}/api`;
// ── THEME ─────────────────────────────────────────────────────
const T = {
  bg:      '#07080a',
  bg2:     '#0d0f12',
  bg3:     '#141618',
  bg4:     '#1b1d21',
  bg5:     '#222529',
  border:  '#1f2126',
  border2: '#2a2d34',
  text:    '#eaebee',
  text2:   '#858c99',
  text3:   '#454b57',
  ink:     '#5c6bc0',
  ink2:    '#7986cb',
  go:      '#26a69a',
  warn:    '#f59e0b',
  err:     '#ef5350',
  sky:     '#29b6f6',
};

const STAGES = ['Lead','Qualified','Proposal','Negotiation','Closed Won','Closed Lost'];
const STAGE_COLORS = { Lead:T.text3, Qualified:T.sky, Proposal:T.warn, Negotiation:T.ink2, 'Closed Won':T.go, 'Closed Lost':T.err };
const USER_COLORS = ['#5c6bc0','#26a69a','#f59e0b','#29b6f6','#ef5350','#ab47bc'];

// ── HELPERS ───────────────────────────────────────────────────
function ucol(n='') { let h=0; for(let c of n) h=(h*31+c.charCodeAt(0))&0xffffffff; return USER_COLORS[Math.abs(h)%USER_COLORS.length]; }
function ini(n='') { return n.split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase(); }
function ago(ts) { if(!ts) return ''; const d=(Date.now()-new Date(ts).getTime())/1000; if(d<60) return 'just now'; if(d<3600) return Math.floor(d/60)+'m ago'; if(d<86400) return Math.floor(d/3600)+'h ago'; return Math.floor(d/86400)+'d ago'; }
function fmtVal(v) { return '$'+Number(v||0).toLocaleString(); }

// ── API CLIENT ────────────────────────────────────────────────
let _token = null;
async function apiFetch(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type':'application/json', ..._token ? { Authorization:`Bearer ${_token}` } : {} },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── PUSH NOTIFICATIONS ────────────────────────────────────────
// Show notifications even when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) return null; // push notifications don't work in simulators

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#5c6bc0',
    });
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenData.data; // e.g. ExponentPushToken[xxxxxxxx]
  } catch (e) {
    console.log('Push token error:', e.message);
    return null;
  }
}

// ── COMPONENTS ────────────────────────────────────────────────

// Button
function Btn({ label, onPress, variant='primary', style, disabled, loading }) {
  const bg = variant==='primary' ? T.ink : variant==='success' ? T.go : variant==='danger' ? T.err : T.bg4;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled||loading}
      style={[{ backgroundColor:bg, borderRadius:8, paddingVertical:11, paddingHorizontal:16, alignItems:'center', flexDirection:'row', justifyContent:'center', gap:6, opacity:(disabled||loading)?0.5:1 }, style]}
    >
      {loading && <ActivityIndicator size="small" color="#fff" />}
      <Text style={{ color:'#fff', fontWeight:'600', fontSize:14 }}>{label}</Text>
    </TouchableOpacity>
  );
}

// Input
function Input({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, multiline, numberOfLines=1 }) {
  return (
    <View style={{ marginBottom:14 }}>
      {label && <Text style={{ fontSize:11, fontWeight:'600', color:T.text3, marginBottom:5, textTransform:'uppercase', letterSpacing:0.4 }}>{label}</Text>}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={T.text3}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType||'default'}
        multiline={multiline}
        numberOfLines={numberOfLines}
        style={{
          backgroundColor:T.bg3, borderWidth:1, borderColor:T.border2, borderRadius:7,
          padding:11, color:T.text, fontSize:14,
          minHeight: multiline ? numberOfLines*40 : undefined,
          textAlignVertical: multiline ? 'top' : 'center'
        }}
      />
    </View>
  );
}

// Badge
function Badge({ label, color=T.text2 }) {
  return (
    <View style={{ backgroundColor:color+'22', borderRadius:20, paddingHorizontal:8, paddingVertical:2, alignSelf:'flex-start' }}>
      <Text style={{ color, fontSize:11, fontWeight:'600' }}>{label}</Text>
    </View>
  );
}

// Card
function Card({ children, style }) {
  return <View style={[{ backgroundColor:T.bg2, borderWidth:1, borderColor:T.border, borderRadius:10, padding:15 }, style]}>{children}</View>;
}

// Avatar
function Avatar({ name, size=34 }) {
  const color = ucol(name);
  return (
    <View style={{ width:size, height:size, borderRadius:size/2, backgroundColor:color+'22', alignItems:'center', justifyContent:'center' }}>
      <Text style={{ color, fontSize:size*0.32, fontWeight:'700' }}>{ini(name)}</Text>
    </View>
  );
}

// Section Header
function SectionHeader({ title, action, onAction }) {
  return (
    <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
      <Text style={{ fontSize:15, fontWeight:'700', color:T.text }}>{title}</Text>
      {action && <TouchableOpacity onPress={onAction}><Text style={{ fontSize:13, color:T.ink2 }}>{action}</Text></TouchableOpacity>}
    </View>
  );
}

// Empty State
function Empty({ message }) {
  return <View style={{ padding:32, alignItems:'center' }}><Text style={{ color:T.text3, fontSize:13 }}>{message}</Text></View>;
}

// Loading
function Loading() {
  return <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}><ActivityIndicator color={T.ink2} size="large" /></View>;
}

// ── MODAL FORM ────────────────────────────────────────────────
function FormModal({ visible, title, onClose, onSubmit, submitLabel='Save', children, loading }) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex:1, backgroundColor:T.bg }}>
        <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{ flex:1 }}>
          <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:16, borderBottomWidth:1, borderColor:T.border }}>
            <TouchableOpacity onPress={onClose}><Text style={{ color:T.text2, fontSize:15 }}>Cancel</Text></TouchableOpacity>
            <Text style={{ fontSize:15, fontWeight:'700', color:T.text }}>{title}</Text>
            <TouchableOpacity onPress={onSubmit} disabled={loading}>
              {loading ? <ActivityIndicator color={T.ink2} /> : <Text style={{ color:T.ink2, fontSize:15, fontWeight:'600' }}>{submitLabel}</Text>}
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:16 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// Picker (simple select)
function Picker({ label, value, onChange, options }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginBottom:14 }}>
      {label && <Text style={{ fontSize:11, fontWeight:'600', color:T.text3, marginBottom:5, textTransform:'uppercase', letterSpacing:0.4 }}>{label}</Text>}
      <TouchableOpacity onPress={()=>setOpen(true)} style={{ backgroundColor:T.bg3, borderWidth:1, borderColor:T.border2, borderRadius:7, padding:11, flexDirection:'row', justifyContent:'space-between' }}>
        <Text style={{ color:T.text, fontSize:14 }}>{value||'Select…'}</Text>
        <Text style={{ color:T.text3 }}>▾</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade">
        <TouchableOpacity style={{ flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'flex-end' }} onPress={()=>setOpen(false)}>
          <View style={{ backgroundColor:T.bg2, borderTopLeftRadius:16, borderTopRightRadius:16, padding:16 }}>
            <Text style={{ fontSize:13, fontWeight:'600', color:T.text2, marginBottom:12, textAlign:'center' }}>{label}</Text>
            {options.map(o=>(
              <TouchableOpacity key={o} onPress={()=>{ onChange(o); setOpen(false); }} style={{ padding:14, borderBottomWidth:1, borderColor:T.border }}>
                <Text style={{ fontSize:15, color: value===o ? T.ink2 : T.text, fontWeight: value===o ? '600' : '400' }}>{o}</Text>
              </TouchableOpacity>
            ))}
            <Btn label="Cancel" variant="ghost" onPress={()=>setOpen(false)} style={{ marginTop:8 }} />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════
// SCREENS
// ════════════════════════════════════════════════════════════════

// ── SIGN IN ───────────────────────────────────────────────────
function SignInScreen({ onAuth, goSignUp }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError(''); setLoading(true);
    try {
      const data = await apiFetch('POST','/auth/signin',{ email:email.trim(), password });
      await AsyncStorage.setItem('crm_token', data.token);
      await AsyncStorage.setItem('crm_user', JSON.stringify(data.user));
      _token = data.token;
      onAuth(data.user);
    } catch(e) { setError(e.message); }
    setLoading(false);
  }

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:T.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{ flex:1, justifyContent:'center', padding:24 }}>
        <Text style={{ fontSize:30, fontWeight:'800', color:T.text, marginBottom:4, letterSpacing:-1 }}>Nexus<Text style={{ color:T.ink2 }}>CRM</Text></Text>
        <Text style={{ fontSize:14, color:T.text3, marginBottom:32 }}>IT Operations Workspace</Text>
        {error ? <View style={{ backgroundColor:T.err+'22', borderWidth:1, borderColor:T.err+'44', borderRadius:8, padding:11, marginBottom:14 }}><Text style={{ color:T.err, fontSize:13 }}>{error}</Text></View> : null}
        <Input label="Work Email" value={email} onChangeText={setEmail} placeholder="you@company.com" keyboardType="email-address" />
        <Input label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />
        <Btn label="Sign In" onPress={submit} loading={loading} style={{ marginTop:4 }} />
        <TouchableOpacity onPress={goSignUp} style={{ marginTop:20, alignItems:'center' }}>
          <Text style={{ color:T.text3, fontSize:13 }}>Don't have an account? <Text style={{ color:T.ink2 }}>Create one</Text></Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── SIGN UP ───────────────────────────────────────────────────
function SignUpScreen({ onAuth, goSignIn }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (!name||!email||!password) return setError('All fields are required');
    if (password !== confirm) return setError('Passwords do not match');
    if (password.length < 6) return setError('Password must be at least 6 characters');
    setLoading(true);
    try {
      const data = await apiFetch('POST','/auth/signup',{ name:name.trim(), email:email.trim(), password });
      await AsyncStorage.setItem('crm_token', data.token);
      await AsyncStorage.setItem('crm_user', JSON.stringify(data.user));
      _token = data.token;
      onAuth(data.user);
    } catch(e) { setError(e.message); }
    setLoading(false);
  }

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:T.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{ flex:1 }}>
        <ScrollView contentContainerStyle={{ padding:24, paddingTop:48 }}>
          <Text style={{ fontSize:30, fontWeight:'800', color:T.text, marginBottom:4, letterSpacing:-1 }}>Nexus<Text style={{ color:T.ink2 }}>CRM</Text></Text>
          <Text style={{ fontSize:14, color:T.text3, marginBottom:32 }}>Create your account</Text>
          {error ? <View style={{ backgroundColor:T.err+'22', borderWidth:1, borderColor:T.err+'44', borderRadius:8, padding:11, marginBottom:14 }}><Text style={{ color:T.err, fontSize:13 }}>{error}</Text></View> : null}
          <Input label="Full Name" value={name} onChangeText={setName} placeholder="Jane Smith" />
          <Input label="Work Email" value={email} onChangeText={setEmail} placeholder="jane@company.com" keyboardType="email-address" />
          <Input label="Password (min. 6 chars)" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />
          <Input label="Confirm Password" value={confirm} onChangeText={setConfirm} placeholder="••••••••" secureTextEntry />
          <Btn label="Create Account" onPress={submit} loading={loading} style={{ marginTop:4 }} />
          <TouchableOpacity onPress={goSignIn} style={{ marginTop:20, alignItems:'center' }}>
            <Text style={{ color:T.text3, fontSize:13 }}>Already have an account? <Text style={{ color:T.ink2 }}>Sign in</Text></Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────────
function DashboardScreen({ data, onRefresh, refreshing }) {
  const { contacts=[], leads=[], deals=[], tickets=[], vendors=[], tasks=[], conversions=[], activity=[] } = data;
  const openT = tickets.filter(t=>t.status!=='resolved').length;
  const openD = deals.filter(d=>d.stage!=='Closed Won'&&d.stage!=='Closed Lost').length;
  const pipeV = deals.filter(d=>d.stage!=='Closed Lost').reduce((a,b)=>a+Number(b.value||0),0);

  const stats = [
    { label:'Contacts', value:contacts.length, color:T.ink2 },
    { label:'Open Leads', value:leads.length, color:T.sky },
    { label:'Pipeline', value:'$'+(pipeV/1000).toFixed(0)+'k', color:T.go },
    { label:'Open Tickets', value:openT, color:T.warn },
    { label:'Vendors', value:vendors.length, color:T.err },
    { label:'Conversions', value:conversions.length, color:T.text2 },
  ];

  return (
    <ScrollView style={{ flex:1, backgroundColor:T.bg }} contentContainerStyle={{ padding:16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.ink2} />}>

      {/* Stats Grid */}
      <View style={{ flexDirection:'row', flexWrap:'wrap', gap:10, marginBottom:20 }}>
        {stats.map(s=>(
          <View key={s.label} style={{ width:'47%', backgroundColor:T.bg2, borderWidth:1, borderColor:T.border, borderRadius:10, padding:14 }}>
            <Text style={{ fontSize:10, color:T.text3, fontWeight:'600', textTransform:'uppercase', letterSpacing:0.5, marginBottom:6 }}>{s.label}</Text>
            <Text style={{ fontSize:24, fontWeight:'800', color:s.color, letterSpacing:-0.5 }}>{s.value}</Text>
          </View>
        ))}
      </View>

      {/* Recent Activity */}
      <Card style={{ marginBottom:16 }}>
        <SectionHeader title="Recent Activity" />
        {activity.slice(0,5).map(a=>(
          <View key={a.id} style={{ flexDirection:'row', gap:10, paddingVertical:8, borderBottomWidth:1, borderColor:T.border }}>
            <Avatar name={a.user_name||'?'} size={28} />
            <View style={{ flex:1 }}>
              <Text style={{ fontSize:12.5, color:T.text2 }}><Text style={{ color:T.text, fontWeight:'500' }}>{a.user_name}</Text> {a.action}{a.target?' '+a.target:''}</Text>
              <Text style={{ fontSize:10.5, color:T.text3, marginTop:2 }}>{ago(a.created_at)}</Text>
            </View>
          </View>
        ))}
        {!activity.length && <Empty message="No activity yet" />}
      </Card>

      {/* Open Tickets */}
      <Card style={{ marginBottom:16 }}>
        <SectionHeader title="Open Tickets" />
        {tickets.filter(t=>t.status!=='resolved').slice(0,3).map(t=>(
          <View key={t.id} style={{ flexDirection:'row', alignItems:'center', gap:8, paddingVertical:8, borderBottomWidth:1, borderColor:T.border }}>
            <Badge label={t.type} color={t.type==='complaint'?T.warn:t.type==='bug'?T.err:T.sky} />
            <Text style={{ flex:1, fontSize:13, color:T.text }} numberOfLines={1}>{t.title}</Text>
          </View>
        ))}
        {!tickets.filter(t=>t.status!=='resolved').length && <Empty message="No open tickets" />}
      </Card>

      {/* Pending Tasks */}
      <Card>
        <SectionHeader title="My Tasks" />
        {tasks.filter(t=>!t.done).slice(0,4).map(t=>(
          <View key={t.id} style={{ flexDirection:'row', gap:10, paddingVertical:8, borderBottomWidth:1, borderColor:T.border }}>
            <View style={{ width:16, height:16, borderRadius:4, borderWidth:1.5, borderColor:T.border2, marginTop:2 }} />
            <View style={{ flex:1 }}>
              <Text style={{ fontSize:13, color:T.text }}>{t.title}</Text>
              <Text style={{ fontSize:11, color:T.text3, marginTop:2 }}>{t.contact} · {t.due}</Text>
            </View>
          </View>
        ))}
        {!tasks.filter(t=>!t.done).length && <Empty message="All caught up!" />}
      </Card>
    </ScrollView>
  );
}

// ── CONTACTS ─────────────────────────────────────────────────
function ContactsScreen({ data, onRefresh, refreshing, onAdd, onEdit, onDelete }) {
  const [search, setSearch] = useState('');
  const filtered = data.contacts.filter(c=>!search||c.name.toLowerCase().includes(search.toLowerCase())||c.company?.toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={{ flex:1, backgroundColor:T.bg }}>
      <View style={{ padding:16, paddingBottom:8 }}>
        <TextInput value={search} onChangeText={setSearch} placeholder="Search contacts…" placeholderTextColor={T.text3}
          style={{ backgroundColor:T.bg3, borderWidth:1, borderColor:T.border, borderRadius:8, padding:10, color:T.text, fontSize:14 }} />
      </View>
      <FlatList data={filtered} keyExtractor={i=>String(i.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.ink2} />}
        contentContainerStyle={{ padding:16, paddingTop:8 }}
        ListEmptyComponent={<Empty message="No contacts found" />}
        renderItem={({item:c})=>(
          <Card style={{ marginBottom:10 }}>
            <View style={{ flexDirection:'row', alignItems:'center', gap:12, marginBottom:10 }}>
              <Avatar name={c.name} size={40} />
              <View style={{ flex:1 }}>
                <Text style={{ fontSize:14, fontWeight:'600', color:T.text }}>{c.name}</Text>
                <Text style={{ fontSize:12, color:T.text2 }}>{c.company||'—'}</Text>
              </View>
              <Badge label={c.status} color={c.status==='client'?T.go:c.status==='lead'?T.sky:T.warn} />
            </View>
            <Text style={{ fontSize:12, color:T.text3, marginBottom:4 }}>📧 {c.email||'—'}</Text>
            <Text style={{ fontSize:12, color:T.text3, marginBottom:10 }}>📞 {c.phone||'—'}</Text>
            <View style={{ flexDirection:'row', gap:8 }}>
              <TouchableOpacity onPress={()=>onEdit(c)} style={{ flex:1, backgroundColor:T.bg4, borderRadius:6, padding:8, alignItems:'center' }}>
                <Text style={{ color:T.text2, fontSize:12, fontWeight:'500' }}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={()=>onDelete(c.id)} style={{ flex:1, backgroundColor:T.err+'22', borderRadius:6, padding:8, alignItems:'center' }}>
                <Text style={{ color:T.err, fontSize:12, fontWeight:'500' }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}
      />
    </View>
  );
}

// ── PIPELINE ─────────────────────────────────────────────────
function PipelineScreen({ data, onRefresh, refreshing, onAdd, onEdit, onDelete }) {
  const [stage, setStage] = useState('Qualified');
  const deals = data.deals.filter(d=>d.stage===stage);

  return (
    <View style={{ flex:1, backgroundColor:T.bg }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight:50, paddingHorizontal:16, paddingTop:12 }}>
        {STAGES.map(s=>(
          <TouchableOpacity key={s} onPress={()=>setStage(s)} style={{ marginRight:8, paddingHorizontal:12, paddingVertical:6, borderRadius:20, backgroundColor:stage===s?STAGE_COLORS[s]+'33':T.bg3, borderWidth:1, borderColor:stage===s?STAGE_COLORS[s]:T.border }}>
            <Text style={{ color:stage===s?STAGE_COLORS[s]:T.text2, fontSize:12.5, fontWeight:stage===s?'600':'400' }}>{s}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <FlatList data={deals} keyExtractor={i=>String(i.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.ink2} />}
        contentContainerStyle={{ padding:16 }}
        ListEmptyComponent={<Empty message={`No deals in ${stage}`} />}
        renderItem={({item:d})=>(
          <Card style={{ marginBottom:10 }}>
            <Text style={{ fontSize:14, fontWeight:'600', color:T.text, marginBottom:3 }}>{d.name}</Text>
            <Text style={{ fontSize:12, color:T.text2, marginBottom:10 }}>{d.company||'—'}</Text>
            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <Text style={{ fontSize:16, fontWeight:'700', color:T.go }}>{fmtVal(d.value)}</Text>
              <Badge label={d.probability+'%'} color={T.text2} />
            </View>
            <Text style={{ fontSize:11, color:T.text3, marginBottom:10 }}>Owner: {d.owner||'—'}</Text>
            <View style={{ flexDirection:'row', gap:8 }}>
              <TouchableOpacity onPress={()=>onEdit(d)} style={{ flex:1, backgroundColor:T.bg4, borderRadius:6, padding:8, alignItems:'center' }}>
                <Text style={{ color:T.text2, fontSize:12, fontWeight:'500' }}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={()=>onDelete(d.id)} style={{ flex:1, backgroundColor:T.err+'22', borderRadius:6, padding:8, alignItems:'center' }}>
                <Text style={{ color:T.err, fontSize:12, fontWeight:'500' }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}
      />
    </View>
  );
}

// ── TICKETS ───────────────────────────────────────────────────
function TicketsScreen({ data, onRefresh, refreshing, onAdd, onEdit, onResolve, onDelete }) {
  const [filter, setFilter] = useState('open');
  const tickets = data.tickets.filter(t=>filter==='all'?true:t.status===filter);

  return (
    <View style={{ flex:1, backgroundColor:T.bg }}>
      <View style={{ flexDirection:'row', gap:6, padding:16, paddingBottom:8 }}>
        {['all','open','in-progress','resolved'].map(f=>(
          <TouchableOpacity key={f} onPress={()=>setFilter(f)} style={{ flex:1, backgroundColor:filter===f?T.ink:T.bg3, borderRadius:6, padding:7, alignItems:'center' }}>
            <Text style={{ color:filter===f?'#fff':T.text3, fontSize:11, fontWeight:'500' }}>{f==='in-progress'?'Active':f.charAt(0).toUpperCase()+f.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList data={tickets} keyExtractor={i=>String(i.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.ink2} />}
        contentContainerStyle={{ padding:16, paddingTop:8 }}
        ListEmptyComponent={<Empty message="No tickets in this view" />}
        renderItem={({item:t})=>(
          <Card style={{ marginBottom:10 }}>
            <View style={{ flexDirection:'row', gap:8, marginBottom:8 }}>
              <Badge label={t.type} color={t.type==='complaint'?T.warn:t.type==='bug'?T.err:T.sky} />
              <Badge label={t.priority} color={t.priority==='high'?T.err:t.priority==='medium'?T.warn:T.text2} />
              <Badge label={t.status} color={t.status==='resolved'?T.go:t.status==='in-progress'?T.warn:T.err} />
            </View>
            <Text style={{ fontSize:14, fontWeight:'600', color:T.text, marginBottom:4 }}>{t.title}</Text>
            <Text style={{ fontSize:12, color:T.text2, marginBottom:6 }} numberOfLines={2}>{t.description||''}</Text>
            <Text style={{ fontSize:11, color:T.text3, marginBottom:10 }}>Contact: {t.contact||'—'} · Assigned: {t.assignee||'—'} · {ago(t.created_at)}</Text>
            <View style={{ flexDirection:'row', gap:8 }}>
              {t.status!=='resolved' && (
                <TouchableOpacity onPress={()=>onResolve(t.id)} style={{ flex:1, backgroundColor:T.go+'22', borderRadius:6, padding:8, alignItems:'center' }}>
                  <Text style={{ color:T.go, fontSize:12, fontWeight:'500' }}>Resolve</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={()=>onEdit(t)} style={{ flex:1, backgroundColor:T.bg4, borderRadius:6, padding:8, alignItems:'center' }}>
                <Text style={{ color:T.text2, fontSize:12, fontWeight:'500' }}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={()=>onDelete(t.id)} style={{ flex:1, backgroundColor:T.err+'22', borderRadius:6, padding:8, alignItems:'center' }}>
                <Text style={{ color:T.err, fontSize:12, fontWeight:'500' }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}
      />
    </View>
  );
}

// ── VENDORS ───────────────────────────────────────────────────
function VendorsScreen({ data, onRefresh, refreshing, onAdd, onEdit, onDelete }) {
  return (
    <FlatList data={data.vendors} keyExtractor={i=>String(i.id)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.ink2} />}
      contentContainerStyle={{ padding:16 }}
      ListEmptyComponent={<Empty message="No vendors yet" />}
      renderItem={({item:v})=>(
        <Card style={{ marginBottom:10 }}>
          <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
            <View style={{ flex:1 }}>
              <Text style={{ fontSize:14, fontWeight:'600', color:T.text }}>{v.name}</Text>
              <Text style={{ fontSize:12, color:T.text3 }}>{v.category||''}</Text>
            </View>
            <Badge label={v.status} color={v.status==='active'?T.go:v.status==='reviewing'?T.warn:T.text2} />
          </View>
          <Text style={{ fontSize:12, color:T.text2, marginBottom:2 }}>📧 {v.contact||'—'}</Text>
          <Text style={{ fontSize:12, color:T.text2, marginBottom:2 }}>📞 {v.phone||'—'}</Text>
          <Text style={{ fontSize:12, color:T.text2, marginBottom:8 }}>📄 {v.contract||'—'}</Text>
          {v.notes ? <Text style={{ fontSize:12, color:T.text3, marginBottom:10 }}>{v.notes}</Text> : null}
          <View style={{ flexDirection:'row', gap:8 }}>
            <TouchableOpacity onPress={()=>onEdit(v)} style={{ flex:1, backgroundColor:T.bg4, borderRadius:6, padding:8, alignItems:'center' }}>
              <Text style={{ color:T.text2, fontSize:12, fontWeight:'500' }}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={()=>onDelete(v.id)} style={{ flex:1, backgroundColor:T.err+'22', borderRadius:6, padding:8, alignItems:'center' }}>
              <Text style={{ color:T.err, fontSize:12, fontWeight:'500' }}>Delete</Text>
            </TouchableOpacity>
          </View>
        </Card>
      )}
    />
  );
}

// ── LEADS ─────────────────────────────────────────────────────
function LeadsScreen({ data, onRefresh, refreshing, onCapture, onDelete, onConvert }) {
  return (
    <FlatList data={data.leads} keyExtractor={i=>String(i.id)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.ink2} />}
      contentContainerStyle={{ padding:16 }}
      ListEmptyComponent={<Empty message="No leads yet — tap + to capture one" />}
      renderItem={({item:l})=>(
        <Card style={{ marginBottom:10 }}>
          <View style={{ flexDirection:'row', justifyContent:'space-between', marginBottom:6 }}>
            <Text style={{ fontSize:14, fontWeight:'600', color:T.text }}>{l.name}</Text>
            <Badge label={l.score>=75?'Hot':l.score>=50?'Warm':'Cold'} color={l.score>=75?T.err:l.score>=50?T.warn:T.text2} />
          </View>
          <Text style={{ fontSize:12, color:T.text2, marginBottom:4 }}>{l.company||'—'} · {l.source||'—'}</Text>
          <Text style={{ fontSize:13, fontWeight:'600', color:T.go, marginBottom:8 }}>{fmtVal(l.value)}</Text>
          <View style={{ flexDirection:'row', gap:8 }}>
            <TouchableOpacity onPress={()=>onConvert(l)} style={{ flex:1, backgroundColor:T.go+'22', borderRadius:6, padding:8, alignItems:'center' }}>
              <Text style={{ color:T.go, fontSize:12, fontWeight:'500' }}>Convert</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={()=>onDelete(l.id)} style={{ flex:1, backgroundColor:T.err+'22', borderRadius:6, padding:8, alignItems:'center' }}>
              <Text style={{ color:T.err, fontSize:12, fontWeight:'500' }}>Delete</Text>
            </TouchableOpacity>
          </View>
        </Card>
      )}
    />
  );
}

// ── TASKS ─────────────────────────────────────────────────────
function TasksScreen({ data, onRefresh, refreshing, onAdd, onToggle, onDelete }) {
  const [filter, setFilter] = useState('pending');
  const tasks = data.tasks.filter(t=>filter==='all'?true:filter==='pending'?!t.done:t.done);

  return (
    <View style={{ flex:1, backgroundColor:T.bg }}>
      <View style={{ flexDirection:'row', gap:6, padding:16, paddingBottom:8 }}>
        {['all','pending','done'].map(f=>(
          <TouchableOpacity key={f} onPress={()=>setFilter(f)} style={{ flex:1, backgroundColor:filter===f?T.ink:T.bg3, borderRadius:6, padding:7, alignItems:'center' }}>
            <Text style={{ color:filter===f?'#fff':T.text3, fontSize:12, fontWeight:'500' }}>{f.charAt(0).toUpperCase()+f.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList data={tasks} keyExtractor={i=>String(i.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.ink2} />}
        contentContainerStyle={{ padding:16, paddingTop:8 }}
        ListEmptyComponent={<Empty message="No tasks here" />}
        renderItem={({item:t})=>(
          <Card style={{ marginBottom:8 }}>
            <View style={{ flexDirection:'row', gap:12, alignItems:'flex-start' }}>
              <TouchableOpacity onPress={()=>onToggle(t)} style={{ width:18, height:18, borderRadius:4, borderWidth:1.5, borderColor:t.done?T.go:T.border2, backgroundColor:t.done?T.go:'transparent', alignItems:'center', justifyContent:'center', marginTop:2 }}>
                {t.done && <Text style={{ color:'#000', fontSize:11, fontWeight:'800' }}>✓</Text>}
              </TouchableOpacity>
              <View style={{ flex:1 }}>
                <Text style={{ fontSize:13.5, color:t.done?T.text3:T.text, textDecorationLine:t.done?'line-through':'none' }}>{t.title}</Text>
                <Text style={{ fontSize:11, color:T.text3, marginTop:3 }}>{t.contact||''} · Due {t.due||'—'}</Text>
              </View>
              <Badge label={t.priority} color={t.priority==='high'?T.err:t.priority==='medium'?T.warn:T.text2} />
              <TouchableOpacity onPress={()=>onDelete(t.id)}>
                <Text style={{ color:T.err, fontSize:18 }}>×</Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}
      />
    </View>
  );
}

// ── NOTES ─────────────────────────────────────────────────────
function NotesScreen({ data, onRefresh, refreshing, onAdd, onDelete }) {
  return (
    <FlatList data={data.notes} keyExtractor={i=>String(i.id)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.ink2} />}
      contentContainerStyle={{ padding:16 }}
      ListEmptyComponent={<Empty message="No notes yet" />}
      renderItem={({item:n})=>(
        <Card style={{ marginBottom:10 }}>
          <Text style={{ fontSize:13.5, color:T.text, lineHeight:20, marginBottom:8 }}>{n.content}</Text>
          <View style={{ flexDirection:'row', gap:8, alignItems:'center' }}>
            <Badge label={n.tag||'note'} color={T.ink2} />
            <Text style={{ fontSize:11, color:T.text3 }}>{n.contact||'General'}</Text>
            <Text style={{ fontSize:11, color:T.text3 }}>{n.date||''}</Text>
            <TouchableOpacity onPress={()=>onDelete(n.id)} style={{ marginLeft:'auto' }}>
              <Text style={{ color:T.err, fontSize:18 }}>×</Text>
            </TouchableOpacity>
          </View>
        </Card>
      )}
    />
  );
}

// ── CONVERSION ────────────────────────────────────────────────
function ConversionScreen({ data, onRefresh, refreshing }) {
  const stages = [
    { label:'Leads Captured', n:data.leads.length, color:T.sky },
    { label:'All Contacts',   n:data.contacts.length, color:T.ink2 },
    { label:'Prospects',      n:data.contacts.filter(c=>c.status==='prospect').length, color:T.warn },
    { label:'Clients',        n:data.contacts.filter(c=>c.status==='client').length, color:T.go },
  ];
  const mx = Math.max(...stages.map(s=>s.n),1);

  return (
    <ScrollView style={{ flex:1, backgroundColor:T.bg }} contentContainerStyle={{ padding:16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.ink2} />}>
      <Card style={{ marginBottom:16 }}>
        <SectionHeader title="Conversion Funnel" />
        {stages.map(s=>(
          <View key={s.label} style={{ flexDirection:'row', alignItems:'center', gap:10, paddingVertical:9, borderBottomWidth:1, borderColor:T.border }}>
            <Text style={{ width:100, fontSize:12, color:T.text2 }}>{s.label}</Text>
            <View style={{ flex:1, height:7, backgroundColor:T.bg5, borderRadius:4, overflow:'hidden' }}>
              <View style={{ height:'100%', width:`${Math.max((s.n/mx)*100,2)}%`, backgroundColor:s.color, borderRadius:4 }} />
            </View>
            <Text style={{ width:28, textAlign:'right', fontSize:13, fontWeight:'700', color:s.color, fontFamily:'monospace' }}>{s.n}</Text>
          </View>
        ))}
      </Card>

      <Card>
        <SectionHeader title="Conversion History" />
        {data.conversions.length ? data.conversions.map(c=>(
          <View key={c.id} style={{ paddingVertical:10, borderBottomWidth:1, borderColor:T.border }}>
            <View style={{ flexDirection:'row', justifyContent:'space-between', marginBottom:3 }}>
              <Text style={{ fontSize:13.5, fontWeight:'600', color:T.text }}>{c.lead_name}</Text>
              <Text style={{ fontSize:13, fontWeight:'700', color:T.go, fontFamily:'monospace' }}>{fmtVal(c.deal_value)}</Text>
            </View>
            <Text style={{ fontSize:11.5, color:T.text3 }}>{c.company||'—'} → {c.deal_name} · by {c.converted_by} · {fmtDate(c.created_at)}</Text>
          </View>
        )) : <Empty message="No conversions yet — go to Lead Capture to convert one" />}
      </Card>
    </ScrollView>
  );
}
function fmtDate(ts) { if(!ts) return '—'; return new Date(ts).toLocaleDateString(); }

// ── ADMIN SCREEN ──────────────────────────────────────────────
function AdminScreen({ currentUser, onRefresh, refreshing }) {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('users'); // users | stats

  useEffect(()=>{ loadAdmin(); },[]);

  async function loadAdmin() {
    setLoading(true);
    try {
      const [u, s] = await Promise.all([
        apiFetch('GET','/admin/users'),
        apiFetch('GET','/admin/stats'),
      ]);
      setUsers(u); setStats(s);
    } catch(e) { Alert.alert('Error', e.message); }
    setLoading(false);
  }

  async function toggleActive(user) {
    const endpoint = user.active===false ? `/admin/users/${user.id}/enable` : `/admin/users/${user.id}/disable`;
    const action = user.active===false ? 'enable' : 'disable';
    Alert.alert(`${action.charAt(0).toUpperCase()+action.slice(1)} user?`, `${action === 'disable' ? 'They will no longer be able to sign in.' : 'They will be able to sign in again.'}`, [
      {text:'Cancel', style:'cancel'},
      {text:action.charAt(0).toUpperCase()+action.slice(1), style: action==='disable'?'destructive':'default', onPress: async()=>{
        try {
          const updated = await apiFetch('PUT', endpoint);
          setUsers(us => us.map(u=>u.id===updated.id?updated:u));
        } catch(e){ Alert.alert('Error',e.message); }
      }}
    ]);
  }

  async function changeRole(user) {
    const newRole = user.role==='admin' ? 'member' : 'admin';
    Alert.alert('Change role?', `Set ${user.name} as ${newRole}?`, [
      {text:'Cancel', style:'cancel'},
      {text:'Confirm', onPress: async()=>{
        try {
          const updated = await apiFetch('PUT',`/admin/users/${user.id}/role`,{role:newRole});
          setUsers(us => us.map(u=>u.id===updated.id?updated:u));
        } catch(e){ Alert.alert('Error',e.message); }
      }}
    ]);
  }

  async function deleteUser(user) {
    Alert.alert('Delete user?', `Permanently delete ${user.name}? This cannot be undone.`, [
      {text:'Cancel', style:'cancel'},
      {text:'Delete', style:'destructive', onPress: async()=>{
        try {
          await apiFetch('DELETE',`/admin/users/${user.id}`);
          setUsers(us => us.filter(u=>u.id!==user.id));
        } catch(e){ Alert.alert('Error',e.message); }
      }}
    ]);
  }

  if (loading) return <Loading />;

  return (
    <ScrollView style={{flex:1, backgroundColor:T.bg}} contentContainerStyle={{padding:16}}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{loadAdmin();onRefresh&&onRefresh();}} tintColor={T.ink2} />}>

      {/* Admin badge */}
      <View style={{flexDirection:'row', alignItems:'center', gap:8, marginBottom:16}}>
        <View style={{backgroundColor:T.warnbg, borderWidth:1, borderColor:T.warnbd, borderRadius:8, paddingHorizontal:10, paddingVertical:5}}>
          <Text style={{color:T.warn, fontSize:12, fontWeight:'700'}}>⚙ ADMIN PANEL</Text>
        </View>
      </View>

      {/* Stats */}
      {stats && (
        <View style={{flexDirection:'row', flexWrap:'wrap', gap:9, marginBottom:18}}>
          {[
            {label:'Total Users',    val:stats.users,        color:T.ink2},
            {label:'Contacts',       val:stats.contacts,     color:T.go},
            {label:'Open Leads',     val:stats.leads,        color:T.sky},
            {label:'Active Deals',   val:stats.openDeals,    color:T.warn},
            {label:'Open Tickets',   val:stats.openTickets,  color:T.err},
          ].map(s=>(
            <View key={s.label} style={{width:'47%', backgroundColor:T.bg2, borderWidth:1, borderColor:T.border, borderRadius:10, padding:13}}>
              <Text style={{fontSize:10, color:T.text3, fontWeight:'600', textTransform:'uppercase', letterSpacing:0.5, marginBottom:5}}>{s.label}</Text>
              <Text style={{fontSize:22, fontWeight:'800', color:s.color, letterSpacing:-0.5}}>{s.val}</Text>
            </View>
          ))}
        </View>
      )}

      {/* User list */}
      <Card>
        <SectionHeader title={`Team Members (${users.length})`} />
        {users.map(u=>(
          <View key={u.id} style={{paddingVertical:12, borderBottomWidth:1, borderColor:T.border}}>
            <View style={{flexDirection:'row', alignItems:'center', gap:10, marginBottom:8}}>
              <Avatar name={u.name} size={36} />
              <View style={{flex:1}}>
                <View style={{flexDirection:'row', alignItems:'center', gap:6}}>
                  <Text style={{fontSize:14, fontWeight:'600', color: u.active===false ? T.text3 : T.text}}>{u.name}</Text>
                  {u.active===false && <Badge label="Disabled" color={T.err} />}
                  {u.id===currentUser.id && <Badge label="You" color={T.go} />}
                </View>
                <Text style={{fontSize:12, color:T.text3}}>{u.email}</Text>
              </View>
              <Badge label={u.role} color={u.role==='admin'?T.warn:T.text2} />
            </View>
            {/* Don't show actions for self */}
            {u.id !== currentUser.id && (
              <View style={{flexDirection:'row', gap:7}}>
                <TouchableOpacity onPress={()=>toggleActive(u)} style={{flex:1, backgroundColor: u.active===false ? T.gobg : T.errbg, borderWidth:1, borderColor: u.active===false ? T.gobd : T.errbd, borderRadius:7, padding:8, alignItems:'center'}}>
                  <Text style={{color: u.active===false ? T.go : T.err, fontSize:12, fontWeight:'500'}}>{u.active===false ? 'Enable' : 'Disable'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={()=>changeRole(u)} style={{flex:1, backgroundColor:T.warnbg, borderWidth:1, borderColor:T.warnbd, borderRadius:7, padding:8, alignItems:'center'}}>
                  <Text style={{color:T.warn, fontSize:12, fontWeight:'500'}}>Make {u.role==='admin'?'Member':'Admin'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={()=>deleteUser(u)} style={{backgroundColor:T.errbg, borderWidth:1, borderColor:T.errbd, borderRadius:7, padding:8, paddingHorizontal:12, alignItems:'center'}}>
                  <Text style={{color:T.err, fontSize:12, fontWeight:'500'}}>Del</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}
      </Card>

      {/* Recent activity */}
      {stats?.recentActivity?.length > 0 && (
        <Card style={{marginTop:14}}>
          <SectionHeader title="Recent Activity" />
          {stats.recentActivity.slice(0,10).map(a=>(
            <View key={a.id} style={{flexDirection:'row', gap:8, paddingVertical:8, borderBottomWidth:1, borderColor:T.border}}>
              <Avatar name={a.user_name||'?'} size={24} />
              <View style={{flex:1}}>
                <Text style={{fontSize:12.5, color:T.text2}}><Text style={{color:T.text, fontWeight:'500'}}>{a.user_name}</Text> {a.action}{a.target?' '+a.target:''}</Text>
                <Text style={{fontSize:10.5, color:T.text3}}>{ago(a.created_at)}</Text>
              </View>
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

// ── MORE MENU ─────────────────────────────────────────────────
function MoreScreen({ onNavigate, badges={}, currentUser }) {
  const visibleItems = MORE_ITEMS.filter(item => !item.adminOnly || currentUser?.role === 'admin');
  return (
    <ScrollView style={{ flex:1, backgroundColor:T.bg }} contentContainerStyle={{ padding:16 }}>
      {visibleItems.map(item=>(
        <TouchableOpacity key={item.key} onPress={()=>onNavigate(item.key)} style={{ marginBottom:10 }}>
          <Card style={{ flexDirection:'row', alignItems:'center', gap:14, borderColor: item.key==='admin' ? T.warnbd : T.border }}>
            <View style={{ width:42, height:42, borderRadius:10, backgroundColor: item.key==='admin' ? T.warnbg : T.bg4, alignItems:'center', justifyContent:'center' }}>
              <Text style={{ fontSize:20 }}>{item.icon}</Text>
            </View>
            <View style={{ flex:1 }}>
              <Text style={{ fontSize:14.5, fontWeight:'600', color:T.text, marginBottom:2 }}>{item.label}</Text>
              <Text style={{ fontSize:12, color:T.text3 }}>{item.desc}</Text>
            </View>
            {badges[item.key] ? (
              <View style={{ backgroundColor:T.err, borderRadius:10, minWidth:20, height:20, alignItems:'center', justifyContent:'center', paddingHorizontal:5 }}>
                <Text style={{ color:'#fff', fontSize:11, fontWeight:'700' }}>{badges[item.key]}</Text>
              </View>
            ) : null}
            <Text style={{ color:T.text3, fontSize:18 }}>›</Text>
          </Card>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// Sub-screen header with back button, used for screens opened from "More"
function SubScreenHeader({ title, onBack }) {
  return (
    <View style={{ flexDirection:'row', alignItems:'center', gap:10, paddingHorizontal:16, paddingVertical:10, backgroundColor:T.bg2, borderBottomWidth:1, borderColor:T.border }}>
      <TouchableOpacity onPress={onBack} style={{ padding:4 }}>
        <Text style={{ color:T.ink2, fontSize:22 }}>‹</Text>
      </TouchableOpacity>
      <Text style={{ fontSize:15, fontWeight:'700', color:T.text }}>{title}</Text>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════
// MAIN APP
// ════════════════════════════════════════════════════════════════
const TABS = [
  { key:'dash',     label:'Home',     icon:'⊞' },
  { key:'contacts', label:'Contacts', icon:'👤' },
  { key:'deals',    label:'Pipeline', icon:'◈' },
  { key:'tasks',    label:'Tasks',    icon:'✓'  },
  { key:'more',     label:'More',     icon:'☰' },
];

const MORE_ITEMS = [
  { key:'leads',    label:'Lead Capture',    icon:'◎',  desc:'Capture and score new leads' },
  { key:'convert',  label:'Conversion',      icon:'⇄',  desc:'Convert leads to clients' },
  { key:'tickets',  label:'Support Tickets', icon:'🎫', desc:'Inquiries, complaints & bugs' },
  { key:'vendors',  label:'Vendors',         icon:'🏢', desc:'Manage vendor relationships' },
  { key:'notes',    label:'Notes',           icon:'📝', desc:'Call logs, meetings & history' },
  { key:'admin',    label:'Admin Panel',     icon:'⚙',  desc:'Manage users & workspace', adminOnly:true },
];

export default function App() {
  const [authScreen, setAuthScreen] = useState('signin'); // signin | signup
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('dash');
  const [subTab, setSubTab] = useState(null); // active screen within "More"
  const [devicePushToken, setDevicePushToken] = useState(null);
  const [data, setData] = useState({ contacts:[], leads:[], deals:[], tickets:[], vendors:[], tasks:[], notes:[], conversions:[], activity:[], team:[] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Notifications
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifPanel, setNotifPanel] = useState(false);

  // Form modals
  const [contactModal, setContactModal] = useState({ visible:false, item:null });
  const [dealModal, setDealModal] = useState({ visible:false, item:null });
  const [ticketModal, setTicketModal] = useState({ visible:false, item:null });
  const [vendorModal, setVendorModal] = useState({ visible:false, item:null });
  const [taskModal, setTaskModal] = useState({ visible:false });
  const [noteModal, setNoteModal] = useState({ visible:false });
  const [leadModal, setLeadModal] = useState({ visible:false });
  const [convertModal, setConvertModal] = useState({ visible:false, lead:null });
  const [formLoading, setFormLoading] = useState(false);

  // Form state
  const [form, setForm] = useState({});
  const sf = (k,v) => setForm(f=>({...f,[k]:v}));

  // Auto-login
  useEffect(()=>{
    (async()=>{
      const token = await AsyncStorage.getItem('crm_token');
      const u = await AsyncStorage.getItem('crm_user');
      if (token && u) { _token=token; setUser(JSON.parse(u)); }
      setLoading(false);
    })();
  },[]);

  // Load data when user logs in
  useEffect(()=>{
    if(!user) return;
    loadAll();
    loadNotifications();
    // Poll for new notifications every 20 seconds
    const interval = setInterval(loadNotifications, 20000);
    return () => clearInterval(interval);
  },[user]);

  // Register for push notifications once user is logged in
  useEffect(()=>{
    if (!user) return;
    (async()=>{
      const pushToken = await registerForPushNotificationsAsync();
      if (pushToken) {
        setDevicePushToken(pushToken);
        try { await apiFetch('POST','/push-token',{ token:pushToken }); }
        catch(e) { console.log('Failed to register push token:', e.message); }
      }
    })();
  },[user]);

  // Listen for notification taps — refresh data when the app is opened from a notification
  useEffect(()=>{
    const sub = Notifications.addNotificationResponseReceivedListener(response=>{
      const data = response.notification.request.content.data;
      if (data?.screen === 'tickets') { setTab('more'); setSubTab('tickets'); }
      if (data?.screen === 'tasks')   { setTab('tasks'); }
      if (user) loadAll();
    });
    return ()=>sub.remove();
  },[user]);

  async function loadAll() {
    try {
      const [contacts,leads,deals,tickets,vendors,tasks,notes,conversions,activity,team] = await Promise.all([
        apiFetch('GET','/contacts'), apiFetch('GET','/leads'), apiFetch('GET','/deals'),
        apiFetch('GET','/tickets'), apiFetch('GET','/vendors'), apiFetch('GET','/tasks'),
        apiFetch('GET','/notes'), apiFetch('GET','/conversions'), apiFetch('GET','/activity'),
        apiFetch('GET','/team'),
      ]);
      setData({contacts,leads,deals,tickets,vendors,tasks,notes,conversions,activity,team});
    } catch(e) { Alert.alert('Error', e.message); }
  }

  const onRefresh = useCallback(async()=>{ setRefreshing(true); await loadAll(); await loadNotifications(); setRefreshing(false); },[]);

  async function loadNotifications() {
    try {
      const [notifs, countData] = await Promise.all([
        apiFetch('GET', '/notifications'),
        apiFetch('GET', '/notifications/unread-count'),
      ]);
      setNotifications(notifs);
      setUnreadCount(countData.count);
    } catch(e) {}
  }

  async function markAllRead() {
    await apiFetch('PUT', '/notifications/read-all');
    setUnreadCount(0);
    setNotifications(n => n.map(x => ({ ...x, read: true })));
  }

  async function clearNotifications() {
    await apiFetch('DELETE', '/notifications');
    setNotifications([]); setUnreadCount(0);
  }

  function onAuth(u) { setUser(u); }
  async function onSignOut() {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text:'Cancel', style:'cancel' },
      { text:'Sign Out', style:'destructive', onPress:async()=>{
        try { await apiFetch('DELETE','/push-token', devicePushToken ? { token: devicePushToken } : undefined); } catch(e) {}
        await AsyncStorage.removeItem('crm_token');
        await AsyncStorage.removeItem('crm_user');
        _token=null; setUser(null);
      }}
    ]);
  }

  // ── CRUD HANDLERS ────────────────────────────────────────────
  async function saveContact() {
    if (!form.name) return Alert.alert('Error','Name is required');
    setFormLoading(true);
    try {
      if (contactModal.item) {
        const u = await apiFetch('PUT',`/contacts/${contactModal.item.id}`,form);
        setData(d=>({...d,contacts:d.contacts.map(c=>c.id===u.id?u:c)}));
      } else {
        const c = await apiFetch('POST','/contacts',form);
        setData(d=>({...d,contacts:[c,...d.contacts]}));
      }
      setContactModal({visible:false,item:null}); setForm({});
    } catch(e){ Alert.alert('Error',e.message); }
    setFormLoading(false);
  }

  async function delContact(id) {
    Alert.alert('Delete','Delete this contact?',[{text:'Cancel',style:'cancel'},{text:'Delete',style:'destructive',onPress:async()=>{
      await apiFetch('DELETE',`/contacts/${id}`);
      setData(d=>({...d,contacts:d.contacts.filter(c=>c.id!==id)}));
    }}]);
  }

  async function saveDeal() {
    if (!form.name) return Alert.alert('Error','Name is required');
    setFormLoading(true);
    try {
      if (dealModal.item) {
        const u = await apiFetch('PUT',`/deals/${dealModal.item.id}`,{...form,value:Number(form.value||0),probability:Number(form.probability||0)});
        setData(d=>({...d,deals:d.deals.map(x=>x.id===u.id?u:x)}));
      } else {
        const x = await apiFetch('POST','/deals',{...form,value:Number(form.value||0),probability:Number(form.probability||0)});
        setData(d=>({...d,deals:[x,...d.deals]}));
      }
      setDealModal({visible:false,item:null}); setForm({});
    } catch(e){ Alert.alert('Error',e.message); }
    setFormLoading(false);
  }

  async function delDeal(id) {
    Alert.alert('Delete','Delete this deal?',[{text:'Cancel',style:'cancel'},{text:'Delete',style:'destructive',onPress:async()=>{
      await apiFetch('DELETE',`/deals/${id}`);
      setData(d=>({...d,deals:d.deals.filter(x=>x.id!==id)}));
    }}]);
  }

  async function saveTicket() {
    if (!form.title) return Alert.alert('Error','Title is required');
    setFormLoading(true);
    try {
      if (ticketModal.item) {
        const u = await apiFetch('PUT',`/tickets/${ticketModal.item.id}`,{...form,status:ticketModal.item.status});
        setData(d=>({...d,tickets:d.tickets.map(x=>x.id===u.id?u:x)}));
      } else {
        const x = await apiFetch('POST','/tickets',form);
        setData(d=>({...d,tickets:[x,...d.tickets]}));
      }
      setTicketModal({visible:false,item:null}); setForm({});
    } catch(e){ Alert.alert('Error',e.message); }
    setFormLoading(false);
  }

  async function resolveTicket(id) {
    const t = data.tickets.find(x=>x.id===id);
    const u = await apiFetch('PUT',`/tickets/${id}`,{...t,status:'resolved'});
    setData(d=>({...d,tickets:d.tickets.map(x=>x.id===id?u:x)}));
  }

  async function delTicket(id) {
    Alert.alert('Delete','Delete this ticket?',[{text:'Cancel',style:'cancel'},{text:'Delete',style:'destructive',onPress:async()=>{
      await apiFetch('DELETE',`/tickets/${id}`);
      setData(d=>({...d,tickets:d.tickets.filter(x=>x.id!==id)}));
    }}]);
  }

  async function saveVendor() {
    if (!form.name) return Alert.alert('Error','Name is required');
    setFormLoading(true);
    try {
      if (vendorModal.item) {
        const u = await apiFetch('PUT',`/vendors/${vendorModal.item.id}`,form);
        setData(d=>({...d,vendors:d.vendors.map(x=>x.id===u.id?u:x)}));
      } else {
        const x = await apiFetch('POST','/vendors',form);
        setData(d=>({...d,vendors:[x,...d.vendors]}));
      }
      setVendorModal({visible:false,item:null}); setForm({});
    } catch(e){ Alert.alert('Error',e.message); }
    setFormLoading(false);
  }

  async function delVendor(id) {
    Alert.alert('Delete','Delete this vendor?',[{text:'Cancel',style:'cancel'},{text:'Delete',style:'destructive',onPress:async()=>{
      await apiFetch('DELETE',`/vendors/${id}`);
      setData(d=>({...d,vendors:d.vendors.filter(x=>x.id!==id)}));
    }}]);
  }

  async function saveTask() {
    if (!form.title) return Alert.alert('Error','Title is required');
    setFormLoading(true);
    try {
      const x = await apiFetch('POST','/tasks',form);
      setData(d=>({...d,tasks:[x,...d.tasks]}));
      setTaskModal({visible:false}); setForm({});
    } catch(e){ Alert.alert('Error',e.message); }
    setFormLoading(false);
  }

  async function toggleTask(t) {
    const u = await apiFetch('PUT',`/tasks/${t.id}`,{...t,done:!t.done});
    setData(d=>({...d,tasks:d.tasks.map(x=>x.id===u.id?u:x)}));
  }

  async function delTask(id) {
    await apiFetch('DELETE',`/tasks/${id}`);
    setData(d=>({...d,tasks:d.tasks.filter(x=>x.id!==id)}));
  }

  async function saveNote() {
    if (!form.content) return Alert.alert('Error','Content is required');
    setFormLoading(true);
    try {
      const x = await apiFetch('POST','/notes',{...form,date:form.date||new Date().toISOString().split('T')[0]});
      setData(d=>({...d,notes:[x,...d.notes]}));
      setNoteModal({visible:false}); setForm({});
    } catch(e){ Alert.alert('Error',e.message); }
    setFormLoading(false);
  }

  async function delNote(id) {
    await apiFetch('DELETE',`/notes/${id}`);
    setData(d=>({...d,notes:d.notes.filter(x=>x.id!==id)}));
  }

  async function captureLead() {
    if (!form.name) return Alert.alert('Error','Name is required');
    setFormLoading(true);
    try {
      const score = (form.source==='referral'?30:form.source==='event'?20:10) + (Number(form.value||0)>10000?20:10) + 20;
      const x = await apiFetch('POST','/leads',{...form,value:Number(form.value||0),score:Math.min(score,100)});
      setData(d=>({...d,leads:[x,...d.leads]}));
      setLeadModal({visible:false}); setForm({});
    } catch(e){ Alert.alert('Error',e.message); }
    setFormLoading(false);
  }

  async function delLead(id) {
    await apiFetch('DELETE',`/leads/${id}`);
    setData(d=>({...d,leads:d.leads.filter(x=>x.id!==id)}));
  }

  async function doConvert() {
    if (!form.dealName) return Alert.alert('Error','Deal name is required');
    setFormLoading(true);
    try {
      const lead = convertModal.lead;
      const conv = await apiFetch('POST','/conversions',{ leadName:lead.name, company:lead.company||'', dealName:form.dealName, dealValue:Number(form.dealValue||lead.value||0), leadId:lead.id });
      setData(d=>({...d, conversions:[conv,...d.conversions], leads:d.leads.filter(x=>x.id!==lead.id) }));
      await loadAll();
      setConvertModal({visible:false,lead:null}); setForm({});
      Alert.alert('Success',`${lead.name} converted to client!`);
    } catch(e){ Alert.alert('Error',e.message); }
    setFormLoading(false);
  }

  // ── RENDER ───────────────────────────────────────────────────
  if (loading) return <View style={{ flex:1, backgroundColor:T.bg, alignItems:'center', justifyContent:'center' }}><ActivityIndicator color={T.ink2} size="large" /></View>;

  if (!user) {
    return authScreen==='signin'
      ? <SignInScreen onAuth={onAuth} goSignUp={()=>setAuthScreen('signup')} />
      : <SignUpScreen onAuth={onAuth} goSignIn={()=>setAuthScreen('signin')} />;
  }

  const contactNames = data.contacts.map(c=>c.name);
  const teamMemberNames = (data.team||[]).filter(u=>u.active!==false).map(u=>u.name);

  function renderScreen() {
    const props = { data, onRefresh, refreshing };
    if (tab==='dash')     return <DashboardScreen {...props} />;
    if (tab==='contacts') return <ContactsScreen {...props} onAdd={()=>{setForm({status:'lead'});setContactModal({visible:true,item:null});}} onEdit={c=>{setForm(c);setContactModal({visible:true,item:c});}} onDelete={delContact} />;
    if (tab==='deals')    return <PipelineScreen {...props} onAdd={()=>{setForm({stage:'Qualified',probability:40});setDealModal({visible:true,item:null});}} onEdit={d=>{setForm(d);setDealModal({visible:true,item:d});}} onDelete={delDeal} />;
    if (tab==='tasks')    return <TasksScreen {...props} onAdd={()=>{setForm({priority:'medium'});setTaskModal({visible:true});}} onToggle={toggleTask} onDelete={delTask} />;
    if (tab==='more') {
      if (!subTab) return <MoreScreen onNavigate={setSubTab} badges={{
        tickets: data.tickets.filter(x=>x.status==='open').length || 0,
        leads:   data.leads.length || 0,
      }} currentUser={user} />;
      const subLabel = MORE_ITEMS.find(m=>m.key===subTab)?.label || '';
      let screen;
      if (subTab==='leads')   screen = <LeadsScreen {...props} onCapture={()=>{setForm({source:'website'});setLeadModal({visible:true});}} onDelete={delLead} onConvert={l=>{setConvertModal({visible:true,lead:l});setForm({dealValue:l.value||0});}} />;
      if (subTab==='convert') screen = <ConversionScreen {...props} />;
      if (subTab==='tickets') screen = <TicketsScreen {...props} onAdd={()=>{setForm({type:'inquiry',priority:'medium'});setTicketModal({visible:true,item:null});}} onEdit={t=>{setForm(t);setTicketModal({visible:true,item:t});}} onResolve={resolveTicket} onDelete={delTicket} />;
      if (subTab==='vendors') screen = <VendorsScreen {...props} onAdd={()=>{setForm({status:'active'});setVendorModal({visible:true,item:null});}} onEdit={v=>{setForm(v);setVendorModal({visible:true,item:v});}} onDelete={delVendor} />;
      if (subTab==='notes')   screen = <NotesScreen {...props} onAdd={()=>{setForm({tag:'note'});setNoteModal({visible:true});}} onDelete={delNote} />;
      if (subTab==='admin')   screen = <AdminScreen currentUser={user} onRefresh={onRefresh} refreshing={refreshing} />;
      return (
        <View style={{ flex:1 }}>
          <SubScreenHeader title={subLabel} onBack={()=>setSubTab(null)} />
          <View style={{ flex:1 }}>{screen}</View>
        </View>
      );
    }
  }

  function fabAction() {
    if (tab==='contacts') { setForm({status:'lead'}); setContactModal({visible:true,item:null}); }
    if (tab==='deals')    { setForm({stage:'Qualified',probability:40}); setDealModal({visible:true,item:null}); }
    if (tab==='tasks')    { setForm({priority:'medium'}); setTaskModal({visible:true}); }
    if (tab==='more') {
      if (subTab==='tickets') { setForm({type:'inquiry',priority:'medium'}); setTicketModal({visible:true,item:null}); }
      if (subTab==='vendors') { setForm({status:'active'}); setVendorModal({visible:true,item:null}); }
      if (subTab==='leads')   { setForm({source:'website'}); setLeadModal({visible:true}); }
      if (subTab==='notes')   { setForm({tag:'note'}); setNoteModal({visible:true}); }
    }
  }

  const fabSubTabs = ['tickets','vendors','leads','notes'];
  const showFab = ['contacts','deals','tasks'].includes(tab) || (tab==='more' && fabSubTabs.includes(subTab));

  return (
    <View style={{ flex:1, backgroundColor:T.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg2} />
      <SafeAreaView style={{ flex:1 }}>
        {/* Header */}
        <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:16, paddingVertical:10, backgroundColor:T.bg2, borderBottomWidth:1, borderColor:T.border }}>
          <Text style={{ fontSize:18, fontWeight:'800', color:T.text, letterSpacing:-0.5 }}>Nexus<Text style={{ color:T.ink2 }}>CRM</Text></Text>
          <View style={{ flexDirection:'row', alignItems:'center', gap:10 }}>
            {/* Bell icon with unread badge */}
            <TouchableOpacity onPress={()=>{ setNotifPanel(true); if(unreadCount>0) markAllRead(); }} style={{ position:'relative', padding:6 }}>
              <Text style={{ fontSize:20 }}>🔔</Text>
              {unreadCount > 0 && (
                <View style={{ position:'absolute', top:2, right:2, backgroundColor:T.err, borderRadius:9, minWidth:18, height:18, alignItems:'center', justifyContent:'center', paddingHorizontal:3, borderWidth:2, borderColor:T.bg2 }}>
                  <Text style={{ color:'#fff', fontSize:10, fontWeight:'800' }}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={onSignOut} style={{ flexDirection:'row', alignItems:'center', gap:6, backgroundColor:T.bg3, borderRadius:20, paddingHorizontal:12, paddingVertical:6 }}>
              <Avatar name={user.name} size={22} />
              <Text style={{ fontSize:12.5, color:T.text2 }}>{user.name.split(' ')[0]}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Notification Panel */}
        <Modal visible={notifPanel} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setNotifPanel(false)}>
          <SafeAreaView style={{ flex:1, backgroundColor:T.bg }}>
            <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:16, borderBottomWidth:1, borderColor:T.border }}>
              <Text style={{ fontSize:16, fontWeight:'700', color:T.text }}>Notifications</Text>
              <View style={{ flexDirection:'row', gap:10, alignItems:'center' }}>
                <TouchableOpacity onPress={clearNotifications}>
                  <Text style={{ fontSize:13, color:T.err }}>Clear all</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={()=>setNotifPanel(false)}>
                  <Text style={{ fontSize:22, color:T.text3 }}>×</Text>
                </TouchableOpacity>
              </View>
            </View>
            {notifications.length === 0
              ? <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
                  <Text style={{ fontSize:36, marginBottom:12 }}>🔔</Text>
                  <Text style={{ fontSize:14, color:T.text3 }}>No notifications yet</Text>
                </View>
              : <FlatList
                  data={notifications}
                  keyExtractor={i=>String(i.id)}
                  contentContainerStyle={{ padding:12 }}
                  renderItem={({item:n})=>(
                    <TouchableOpacity onPress={()=>{
                      setNotifPanel(false);
                      if (n.screen==='tickets') { setTab('more'); setSubTab('tickets'); }
                      if (n.screen==='tasks')   { setTab('tasks'); }
                      if (n.screen==='deals')   { setTab('deals'); }
                    }} style={{ backgroundColor: n.read ? T.bg2 : T.inkbg, borderWidth:1, borderColor: n.read ? T.border : T.inkbd, borderRadius:10, padding:13, marginBottom:8, flexDirection:'row', gap:10 }}>
                      <View style={{ flex:1 }}>
                        <Text style={{ fontSize:13.5, fontWeight: n.read ? '400' : '600', color:T.text, marginBottom:3 }}>{n.title}</Text>
                        {n.body ? <Text style={{ fontSize:12.5, color:T.text2, lineHeight:18 }}>{n.body}</Text> : null}
                        <Text style={{ fontSize:11, color:T.text3, marginTop:4 }}>{ago(n.created_at)}</Text>
                      </View>
                      {!n.read && <View style={{ width:8, height:8, borderRadius:4, backgroundColor:T.ink2, marginTop:4 }} />}
                    </TouchableOpacity>
                  )}
                />
            }
          </SafeAreaView>
        </Modal>

        {/* Screen */}
        <View style={{ flex:1 }}>{renderScreen()}</View>

        {/* FAB */}
        {showFab && (
          <TouchableOpacity onPress={fabAction} style={{ position:'absolute', bottom:72, right:20, width:52, height:52, borderRadius:26, backgroundColor:T.ink, alignItems:'center', justifyContent:'center', elevation:6, shadowColor:'#000', shadowOffset:{width:0,height:3}, shadowOpacity:0.3, shadowRadius:4 }}>
            <Text style={{ color:'#fff', fontSize:26, lineHeight:30 }}>+</Text>
          </TouchableOpacity>
        )}

        {/* Bottom Nav */}
        <View style={{ flexDirection:'row', backgroundColor:T.bg2, borderTopWidth:1, borderColor:T.border, paddingBottom:4 }}>
          {TABS.map(t=>{
            // Compute badge count per tab
            let badge = 0;
            if (t.key==='tasks')   badge = data.tasks.filter(x=>!x.done).length;
            if (t.key==='more')    badge = data.tickets.filter(x=>x.status==='open').length;
            return (
              <TouchableOpacity key={t.key} onPress={()=>{ setTab(t.key); if(t.key!=='more') setSubTab(null); else setSubTab(null); }} style={{ flex:1, alignItems:'center', paddingVertical:8, position:'relative' }}>
                <Text style={{ fontSize:16, marginBottom:2 }}>{t.icon}</Text>
                <Text style={{ fontSize:9.5, color:tab===t.key?T.ink2:T.text3, fontWeight:tab===t.key?'600':'400' }}>{t.label}</Text>
                {badge > 0 && (
                  <View style={{ position:'absolute', top:5, right:'22%', backgroundColor:T.err, borderRadius:8, minWidth:16, height:16, alignItems:'center', justifyContent:'center', paddingHorizontal:2 }}>
                    <Text style={{ color:'#fff', fontSize:9, fontWeight:'800' }}>{badge > 99 ? '99+' : badge}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>

      {/* ── CONTACT FORM ── */}
      <FormModal visible={contactModal.visible} title={contactModal.item?'Edit Contact':'Add Contact'} onClose={()=>{setContactModal({visible:false,item:null});setForm({});}} onSubmit={saveContact} submitLabel={contactModal.item?'Save':'Add'} loading={formLoading}>
        <Input label="Full Name *" value={form.name||''} onChangeText={v=>sf('name',v)} placeholder="Jane Smith" />
        <Input label="Company" value={form.company||''} onChangeText={v=>sf('company',v)} placeholder="Acme Corp" />
        <Input label="Email" value={form.email||''} onChangeText={v=>sf('email',v)} keyboardType="email-address" />
        <Input label="Phone" value={form.phone||''} onChangeText={v=>sf('phone',v)} keyboardType="phone-pad" />
        <Picker label="Status" value={form.status||'lead'} onChange={v=>sf('status',v)} options={['lead','prospect','client','inactive']} />
      </FormModal>

      {/* ── DEAL FORM ── */}
      <FormModal visible={dealModal.visible} title={dealModal.item?'Edit Deal':'Add Deal'} onClose={()=>{setDealModal({visible:false,item:null});setForm({});}} onSubmit={saveDeal} submitLabel={dealModal.item?'Save':'Add'} loading={formLoading}>
        <Input label="Deal Name *" value={form.name||''} onChangeText={v=>sf('name',v)} placeholder="Enterprise License" />
        <Input label="Company" value={form.company||''} onChangeText={v=>sf('company',v)} />
        <Input label="Value ($)" value={String(form.value||'')} onChangeText={v=>sf('value',v)} keyboardType="numeric" />
        <Input label="Probability (%)" value={String(form.probability||'')} onChangeText={v=>sf('probability',v)} keyboardType="numeric" />
        <Picker label="Stage" value={form.stage||'Lead'} onChange={v=>sf('stage',v)} options={STAGES} />
        <Picker label="Contact" value={form.contact||''} onChange={v=>sf('contact',v)} options={['—',...contactNames]} />
        <Picker label="Owner" value={form.owner||user?.name||''} onChange={v=>sf('owner',v)} options={teamMemberNames.length?teamMemberNames:[user?.name||'']} />
      </FormModal>

      {/* ── TICKET FORM ── */}
      <FormModal visible={ticketModal.visible} title={ticketModal.item?'Edit Ticket':'New Ticket'} onClose={()=>{setTicketModal({visible:false,item:null});setForm({});}} onSubmit={saveTicket} submitLabel={ticketModal.item?'Save':'Create'} loading={formLoading}>
        <Input label="Title *" value={form.title||''} onChangeText={v=>sf('title',v)} placeholder="Describe the issue" />
        <Picker label="Type" value={form.type||'inquiry'} onChange={v=>sf('type',v)} options={['inquiry','complaint','bug','other']} />
        <Picker label="Priority" value={form.priority||'medium'} onChange={v=>sf('priority',v)} options={['high','medium','low']} />
        <Picker label="Contact" value={form.contact||'—'} onChange={v=>sf('contact',v)} options={['—',...contactNames]} />
        <Picker label="Assignee" value={form.assignee||user.name} onChange={v=>sf('assignee',v)} options={teamMemberNames.length?teamMemberNames:[user.name]} />
        <Input label="Description" value={form.description||''} onChangeText={v=>sf('description',v)} multiline numberOfLines={4} />
      </FormModal>

      {/* ── VENDOR FORM ── */}
      <FormModal visible={vendorModal.visible} title={vendorModal.item?'Edit Vendor':'Add Vendor'} onClose={()=>{setVendorModal({visible:false,item:null});setForm({});}} onSubmit={saveVendor} submitLabel={vendorModal.item?'Save':'Add'} loading={formLoading}>
        <Input label="Vendor Name *" value={form.name||''} onChangeText={v=>sf('name',v)} placeholder="CloudHost Pro" />
        <Input label="Category" value={form.category||''} onChangeText={v=>sf('category',v)} placeholder="Infrastructure" />
        <Input label="Contact Email" value={form.contact||''} onChangeText={v=>sf('contact',v)} keyboardType="email-address" />
        <Input label="Phone" value={form.phone||''} onChangeText={v=>sf('phone',v)} keyboardType="phone-pad" />
        <Picker label="Status" value={form.status||'active'} onChange={v=>sf('status',v)} options={['active','reviewing','inactive']} />
        <Input label="Contract" value={form.contract||''} onChangeText={v=>sf('contract',v)} placeholder="Annual — $12,000/yr" />
        <Input label="Notes" value={form.notes||''} onChangeText={v=>sf('notes',v)} multiline numberOfLines={3} />
      </FormModal>

      {/* ── TASK FORM ── */}
      <FormModal visible={taskModal.visible} title="Add Task" onClose={()=>{setTaskModal({visible:false});setForm({});}} onSubmit={saveTask} submitLabel="Add" loading={formLoading}>
        <Input label="Title *" value={form.title||''} onChangeText={v=>sf('title',v)} placeholder="Follow up with client" />
        <Picker label="Contact" value={form.contact||'—'} onChange={v=>sf('contact',v)} options={['—',...contactNames]} />
        <Input label="Due Date (YYYY-MM-DD)" value={form.due||''} onChangeText={v=>sf('due',v)} placeholder="2026-07-01" />
        <Picker label="Priority" value={form.priority||'medium'} onChange={v=>sf('priority',v)} options={['high','medium','low']} />
        <Picker label="Assign To" value={form.assigned_to||user?.name||''} onChange={v=>sf('assigned_to',v)} options={teamMemberNames.length?teamMemberNames:[user?.name||'']} />
      </FormModal>

      {/* ── NOTE FORM ── */}
      <FormModal visible={noteModal.visible} title="Add Note" onClose={()=>{setNoteModal({visible:false});setForm({});}} onSubmit={saveNote} submitLabel="Add" loading={formLoading}>
        <Input label="Note *" value={form.content||''} onChangeText={v=>sf('content',v)} placeholder="What happened?" multiline numberOfLines={5} />
        <Picker label="Contact" value={form.contact||'—'} onChange={v=>sf('contact',v)} options={['—',...contactNames]} />
        <Picker label="Tag" value={form.tag||'note'} onChange={v=>sf('tag',v)} options={['note','call','email','meeting']} />
        <Input label="Date (YYYY-MM-DD)" value={form.date||''} onChangeText={v=>sf('date',v)} placeholder={new Date().toISOString().split('T')[0]} />
      </FormModal>

      {/* ── LEAD CAPTURE FORM ── */}
      <FormModal visible={leadModal.visible} title="Capture Lead" onClose={()=>{setLeadModal({visible:false});setForm({});}} onSubmit={captureLead} submitLabel="Save Lead" loading={formLoading}>
        <Input label="Full Name *" value={form.name||''} onChangeText={v=>sf('name',v)} placeholder="John Doe" />
        <Input label="Company" value={form.company||''} onChangeText={v=>sf('company',v)} placeholder="Acme Corp" />
        <Input label="Email" value={form.email||''} onChangeText={v=>sf('email',v)} keyboardType="email-address" />
        <Input label="Phone" value={form.phone||''} onChangeText={v=>sf('phone',v)} keyboardType="phone-pad" />
        <Picker label="Source" value={form.source||'website'} onChange={v=>sf('source',v)} options={['website','referral','cold-call','social','event','other']} />
        <Input label="Est. Value ($)" value={String(form.value||'')} onChangeText={v=>sf('value',v)} keyboardType="numeric" />
        <Input label="Notes" value={form.notes||''} onChangeText={v=>sf('notes',v)} multiline numberOfLines={3} />
      </FormModal>

      {/* ── CONVERT FORM ── */}
      <FormModal visible={convertModal.visible} title={`Convert ${convertModal.lead?.name||'Lead'}`} onClose={()=>{setConvertModal({visible:false,lead:null});setForm({});}} onSubmit={doConvert} submitLabel="Convert to Client" loading={formLoading}>
        <View style={{ backgroundColor:T.go+'11', borderWidth:1, borderColor:T.go+'33', borderRadius:8, padding:12, marginBottom:16 }}>
          <Text style={{ color:T.go, fontSize:13 }}>This will create a new contact and open a deal for <Text style={{ fontWeight:'700' }}>{convertModal.lead?.name}</Text>.</Text>
        </View>
        <Input label="Deal Name *" value={form.dealName||''} onChangeText={v=>sf('dealName',v)} placeholder="Onboarding Package" />
        <Input label="Deal Value ($)" value={String(form.dealValue||'')} onChangeText={v=>sf('dealValue',v)} keyboardType="numeric" />
        <Picker label="Stage" value={form.stage||'Qualified'} onChange={v=>sf('stage',v)} options={['Qualified','Proposal','Negotiation']} />
      </FormModal>
    </View>
  );
}
