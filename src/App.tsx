import { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMap, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { Plus, Minus, Settings, Navigation, Info, Zap, Menu, Locate, Layers, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import 'leaflet/dist/leaflet.css';

const KHARKIV_POS: [number, number] = [49.9935, 36.2304];
const THREATS_JSON_URL = import.meta.env.BASE_URL + 'data.json';

const MAP_LAYERS = {
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    streets: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
};

// --- Helper for Sonar Beep ---
const playSonarBeep = () => {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
};

// --- Custom Marker ---
const getThreatIconPath = (type?: string) => {
    const t = (type || '').toLowerCase();
    if(t.includes('drone') || t.includes('bpla') || t.includes('шахед')) return 'img/drone.png';
    if(t.includes('kab') || t.includes('aircraft')) return 'img/aircraft.png';
    if(t.includes('fpv') || t.includes('lancet')) return 'img/lancet.png';
    if(t.includes('missile') || t.includes('mrls')) return 'img/missile.png';
    if(t.includes('molniya')) return 'img/molniya.png';
    return 'img/drone.png';
};

const createThreatIcon = (type?: string) => {
    return L.divIcon({
        className: 'threat-marker',
        html: `
            <div class="relative flex items-center justify-center">
                <div class="sonar-wrapper"><div class="sonar-ring"></div><div class="sonar-ring"></div><div class="sonar-ring"></div></div>
                <img src="${getThreatIconPath(type)}" class="absolute w-6 h-6 z-10 filter brightness-[1.2] drop-shadow-[0_0_5px_rgba(255,204,0,0.5)]" alt="threat" />
            </div>`,
        iconSize: [40, 40],
    });
};

// --- Threat Card ---
const ThreatCard = (props: any) => {
    const { threat } = props;
    const [expanded, setExpanded] = useState(false);
    return (
        <motion.div layout initial={{opacity: 0, y: 20}} animate={{opacity: 1, y: 0}} transition={{type: "spring", stiffness: 100, damping: 20}} className="glass-liquid rounded-2xl p-4 overflow-hidden border border-[rgba(255,204,0,0.15)] shadow-[inset_0_0_20px_rgba(255,204,0,0.05)] font-nastup" whileTap={{scale: 0.98}} onClick={() => setExpanded(!expanded)}>
            <div className="flex items-center gap-4">
                <div className="flex flex-col items-center gap-1 font-mono text-[10px] text-gray-400">
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse"></div>
                    {threat.time ? new Date(threat.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--'}
                </div>
                <div className="flex-1 text-white font-bold text-lg uppercase tracking-wider">{threat.target || 'Невідомо'}</div>
                <div className="flex flex-col items-end">
                    <img src={getThreatIconPath(threat.type)} className="w-8 h-8 filter brightness-[1.2] drop-shadow-[0_0_5px_rgba(255,204,0,0.5)]" alt="threat" />
                    <span className="text-[9px] text-gray-500 font-mono tracking-tight">{threat.type}</span>
                </div>
                <motion.div animate={{rotate: expanded ? 180 : 0}}><ChevronDown size={18} className="text-gray-500"/></motion.div>
            </div>
            <AnimatePresence>
                {expanded && (
                    <motion.div initial={{height: 0, opacity: 0}} animate={{height: 'auto', opacity: 1}} exit={{height: 0, opacity: 0}} className="mt-4 pt-4 border-t border-[#FFCC00]/20 space-y-2 text-sm text-gray-300 font-nastup">
                        <p>Тип: <span className="text-yellow-500">{threat.type}</span></p>
                        <p>Локація: {threat.target}</p>
                        <p>Джерело: <span className="text-green-500 underline text-xs">monitor1654</span> ‼️</p>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default function App() {
  const [threats, setThreats] = useState<any[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const mapRef = useRef<L.Map | null>(null);

  // Settings State
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('kharkivSettings');
    const parsed = saved ? JSON.parse(saved) : {};
    return { 
        audioAlerts: true, 
        mapLayer: 'dark', 
        alertFilters: ['drone', 'aircraft', 'missile', 'fpv'],
        ...parsed
    };
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  useEffect(() => localStorage.setItem('kharkivSettings', JSON.stringify(settings)), [settings]);

  useEffect(() => {
    const fetchData = async () => {
        try { 
            const response = await fetch(THREATS_JSON_URL); 
            if (!response.ok) {
                console.error('Fetch not OK:', response.status, response.statusText);
                return;
            }
            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                const text = await response.text();
                console.error('Received non-JSON content:', text);
                return;
            }
            const data = await response.json();
            const now = new Date();
            const validThreats = (Array.isArray(data) ? data : []).filter(t => {
                const type = (t.type || '').toLowerCase();
                const target = (t.target || '').toLowerCase();
                const isClear = type.includes('відбій') || 
                                type.includes('чисто') ||
                                target.includes('відбій') ||
                                target.includes('чисто');
                if (isClear) return false;
                
                const threatTime = new Date(t.time);
                const diffMins = (now.getTime() - threatTime.getTime()) / (1000 * 60);
                return diffMins < 60; // 60 minutes
            }).filter(t => {
               const type = (t.type || '').toLowerCase().split(' ')[0];
               return (settings.alertFilters || []).includes(type);
            });
            
            if (validThreats.length > threats.length && settings.audioAlerts) {
                playSonarBeep();
            }
            setThreats(validThreats);
        } catch (error) { console.error('Error fetching threats', error); }
    };
    fetchData(); 
    const interval = setInterval(fetchData, 10000); 
    return () => clearInterval(interval);
  }, [threats, settings.alertFilters, settings.audioAlerts]);

  return (
    <div className="relative w-full h-screen bg-[#080808] font-mono text-white overflow-hidden pb-safe">
        {/* Header */}
        <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between p-4 glass-liquid rounded-b-3xl safe-top border-b border-[rgba(255,204,0,0.15)]">
            <motion.button whileTap={{scale: 0.9}} onClick={() => setIsSettingsOpen(true)} className="p-2 border border-white/10 rounded-xl bg-black/20"><Menu size={20} /></motion.button>
            <div className="flex flex-col items-center">
                <h1 className="text-3xl tracking-[0.1em] text-[#FFCC00] uppercase font-volja drop-shadow-[0_0_15px_rgba(255,204,0,0.4)]">ВАРТА</h1>
                <span className="text-[9px] text-gray-400 font-nastup tracking-widest mt-1">Оновлено: щойно</span>
            </div>
            <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-2 px-3 py-1 border border-[#FFCC00]/30 bg-[#FFCC00]/10 rounded-full text-[#FFCC00] font-bold text-xs font-nastup">
                    <span className="w-2 h-2 rounded-full bg-[#FFCC00] animate-pulse"></span>
                    {threats.length} БПЛА
                </div>
            </div>
        </header>

        {/* Map */}
        <div className="absolute inset-0 z-0">
            <MapContainer center={KHARKIV_POS} zoom={11} className="h-full w-full" zoomControl={false} ref={mapRef}>
                <TileLayer url={MAP_LAYERS[(settings.mapLayer as keyof typeof MAP_LAYERS) || 'dark']} />
                {threats.filter((t: any) => t.lat !== undefined && t.lng !== undefined).map((t: any) => (
                    <Marker key={t.id} position={[t.lat, t.lng]} icon={createThreatIcon(t.type)}>
                        <Tooltip permanent direction="top" className="bg-transparent border-none text-[#FFCC00] font-bold text-[10px] uppercase shadow-none translate-y-2">{t.target}</Tooltip>
                    </Marker>
                ))}
            </MapContainer>
        </div>

        {/* Tactical Controls */}
        <div className="absolute right-4 top-24 z-10 flex flex-col gap-3">
            <button onClick={() => mapRef.current?.zoomIn()} className="p-3 glass-liquid rounded-full text-[#FFCC00]"><Plus size={20}/></button>
            <button onClick={() => mapRef.current?.zoomOut()} className="p-3 glass-liquid rounded-full text-[#FFCC00]"><Minus size={20}/></button>
            <button onClick={() => setSettings(s => ({...s, mapLayer: s.mapLayer === 'dark' ? 'satellite' : 'dark'}))} className="p-3 glass-liquid rounded-full text-[#FFCC00]"><Layers size={20}/></button>
        </div>

        {/* Modals */}
        <AnimatePresence>
            {isSettingsOpen && (
                <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xl p-6 flex flex-col justify-center" onClick={() => setIsSettingsOpen(false)}>
                    <div className="glass-liquid rounded-3xl p-6" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-center mb-6"><img src="img/LOGO.png" className="w-16 filter drop-shadow-[0_0_10px_rgba(255,204,0,0.5)]"/></div>
                        <h2 className="text-xl font-bold mb-6 text-white text-center font-nastup">Налаштування</h2>
                        <div className="space-y-6 font-nastup">
                            <div className="flex justify-between items-center text-white">
                                <span>Audio Alerts</span>
                                <button onClick={() => setSettings(s => ({...s, audioAlerts: !s.audioAlerts}))} className={`w-12 h-6 rounded-full p-1 ${settings.audioAlerts ? 'bg-yellow-600' : 'bg-gray-600'}`}>
                                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${settings.audioAlerts ? 'translate-x-6' : 'translate-x-0'}`}></div>
                                </button>
                            </div>
                            <div className="text-white">Threat Types</div>
                            {['drone', 'aircraft', 'missile', 'fpv'].map(type => (
                                <label key={type} className="flex justify-between text-gray-400 capitalize">
                                    {type}
                                    <input type="checkbox" checked={(settings.alertFilters || []).includes(type)} onChange={e => {
                                        setSettings(s => ({...s, alertFilters: e.target.checked ? [...(s.alertFilters || []), type] : (s.alertFilters || []).filter(t => t !== type)}));
                                    }} />
                                </label>
                            ))}
                        </div>
                    </div>
                </motion.div>
            )}
            {isInfoOpen && (
                 <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xl p-6 flex flex-col justify-center" onClick={() => setIsInfoOpen(false)}>
                     <div className="glass-liquid rounded-3xl p-6 font-nastup" onClick={e => e.stopPropagation()}>
                         <div className="flex justify-center mb-6"><img src="img/LOGO.png" className="w-16 filter drop-shadow-[0_0_10px_rgba(255,204,0,0.5)]"/></div>

                         <h2 className="text-xl font-bold mb-6 text-white text-center">Про проєкт ВАРТА</h2>
                         <p className="text-gray-400 text-sm text-center">Моніторинг загроз у режимі реального часу.</p>
                         <button className="mt-6 w-full py-3 bg-blue-600 rounded-xl" onClick={() => window.open('https://t.me/example', '_blank')}>Telegram</button>
                     </div>
                 </motion.div>
            )}
        </AnimatePresence>

        {/* Bottom Sheet */}
        <motion.div className="fixed bottom-24 left-4 right-4 z-40 glass-liquid rounded-t-3xl p-6 max-h-[50vh] flex flex-col shadow-2xl font-nastup" animate={{ height: isExpanded ? '60vh' : 'auto' }}>
             <div className="h-1 w-12 bg-gray-600 rounded-full mx-auto mb-4 cursor-grab" onPointerDown={() => setIsExpanded(!isExpanded)}></div>
            <button className="w-full py-4 molten-gold rounded-xl font-bold uppercase mb-4 text-white shadow-lg flex items-center justify-center gap-2" onClick={() => window.open('https://t.me/example', '_blank')}><Zap size={16}/>ПІДТРИМАТИ ПРОЄКТ</button>
             <div className="flex-1 overflow-y-auto space-y-2">
                {threats.length === 0 ? (
                    <div className="text-center text-gray-500 py-10">Обстановка спокійна / Загроз не виявлено</div>
                ) : (
                    threats.sort((a,b) => new Date(b.time).getTime() - new Date(a.time).getTime()).map(t => <ThreatCard key={t.id} threat={t} />)
                )}
             </div>
        </motion.div>

        {/* Footer */}
        <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between p-6 px-10 pb-8 glass-liquid rounded-t-3xl border-t border-[rgba(255,204,0,0.15)] font-nastup">
            <motion.button whileTap={{scale: 0.95}} onClick={() => setIsInfoOpen(true)} className="flex flex-col items-center gap-1.5 text-white text-[10px] uppercase tracking-widest">
                <div className="p-2 bg-black/20 rounded-xl border border-white/5"><Info size={20} /></div>
                ПРО НАС
            </motion.button>
            <motion.button whileTap={{scale: 0.9, rotate: 10}} onClick={() => window.open('https://t.me/example', '_blank')} className="p-6 bg-blue-600 rounded-full shadow-[0_0_30px_rgba(37,99,235,0.5)] relative overflow-hidden group">
                <Navigation size={32} className="text-white relative z-10" />
                <div className="absolute inset-0 bg-blue-400 opacity-20 scale-150 animate-ping group-hover:animate-none"></div>
            </motion.button>
            <motion.button whileTap={{scale: 0.95}} onClick={() => setIsSettingsOpen(true)} className="flex flex-col items-center gap-1.5 text-white text-[10px] uppercase tracking-widest font-mono">
                <div className="p-2 bg-black/20 rounded-xl border border-white/5"><Settings size={20} /></div>
                НАЛАШТУВАННЯ
            </motion.button>
        </div>
    </div>
  );
}
