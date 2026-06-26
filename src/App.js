import { useState, useEffect, useMemo } from "react";
import { validateForm } from "./validators.frontend";

// ── TOKENS ───────────────────────────────────────────────────────────
const C = {
  brand:"#0891B2",brandD:"#0E7490",brandL:"#ECFEFF",brandXL:"#F0FDFF",
  green:"#059669",greenL:"#D1FAE5",greenD:"#065F46",
  amber:"#D97706",amberL:"#FEF3C7",amberD:"#92400E",
  red:"#DC2626",redL:"#FEE2E2",redD:"#991B1B",
  purple:"#7C3AED",purpleL:"#EDE9FE",
  ink:"#111827",ink2:"#374151",ink3:"#6B7280",ink4:"#9CA3AF",
  border:"#E5E7EB",bg:"#F9FAFB",surface:"#FFFFFF",
  sidebar:"#0F172A",sidebarHov:"#1E293B",sidebarAct:"#1E3A5F",
  r:"10px",rSm:"6px",rFull:"9999px",
};

const API     = "https://physioclinic-whatsapp-bot.onrender.com";
const DOCS    = ["Dr. Rao","Dr. Mehra","Dr. Singh"];
const DCOL    = {"Dr. Rao":C.brand,"Dr. Mehra":C.green,"Dr. Singh":C.purple};
const TIMES   = ["08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30","18:00"];
const TYPES   = ["Initial Assessment","Follow-up","Physiotherapy Session","Walk-in","Review"];
const PRICES  = {"Initial Assessment":1800,"Follow-up":1200,"Walk-in":900,"Review":1000,"Physiotherapy Session":1500};
const TODAY   = new Date().toISOString().split("T")[0];
const PER     = 12;

// ── RESPONSIVE HOOK ───────────────────────────────────────────────────
function useW() {
  const [w, setW] = useState(typeof window!=="undefined"?window.innerWidth:1200);
  useEffect(()=>{
    const h=()=>setW(window.innerWidth);
    window.addEventListener("resize",h);
    return()=>window.removeEventListener("resize",h);
  },[]);
  return w;
}

// ── CSS ───────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  html,body{height:100%;}
  body{font-family:'Inter',-apple-system,sans-serif;background:${C.bg};color:${C.ink};-webkit-font-smoothing:antialiased;}
  input,select,textarea,button{font-family:inherit;}
  ::-webkit-scrollbar{width:4px;height:4px;}
  ::-webkit-scrollbar-thumb{background:${C.border};border-radius:4px;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
  .up{animation:fadeUp .25s cubic-bezier(.22,1,.36,1) both}
  .in{animation:fadeIn .2s ease both}
  input,select,textarea{
    width:100%;padding:9px 12px;font-size:13px;color:${C.ink};
    background:${C.surface};border:1px solid ${C.border};border-radius:${C.r};
    outline:none;appearance:none;-webkit-appearance:none;
    transition:border-color .15s,box-shadow .15s;
  }
  input::placeholder,textarea::placeholder{color:${C.ink4};}
  input:focus,select:focus,textarea:focus{border-color:${C.brand};box-shadow:0 0 0 3px ${C.brandL};}
  select{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;padding-right:30px;}
  button{cursor:pointer;border:none;outline:none;}
  button:active{transform:scale(.97);}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
  .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}
  .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;}
  @media(max-width:640px){.grid4{grid-template-columns:1fr 1fr;}.grid3{grid-template-columns:1fr 1fr;}}
`;

// ── ATOMS ─────────────────────────────────────────────────────────────
const Avatar=({name="?",size=36})=>{
  const ini=name.split(" ").filter(Boolean).map(w=>w[0]).slice(0,2).join("").toUpperCase();
  const pal=[C.brand,C.green,C.purple,"#F97316","#EC4899","#14B8A6"];
  const col=pal[name.split("").reduce((a,c)=>a+c.charCodeAt(0),0)%pal.length];
  return <div style={{width:size,height:size,borderRadius:C.rFull,flexShrink:0,background:`${col}14`,border:`1.5px solid ${col}28`,color:col,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:size*.3,letterSpacing:".3px"}}>{ini}</div>;
};

const Pill=({label,bg="#F3F4F6",color=C.ink3})=>(
  <span style={{display:"inline-block",background:bg,color,fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:C.rFull,whiteSpace:"nowrap",letterSpacing:".2px"}}>{label}</span>
);

const sPill=v=>{
  const m={paid:{l:"Paid",bg:C.greenL,c:C.greenD},pending:{l:"Pending",bg:C.amberL,c:C.amberD},clinic:{l:"At Clinic",bg:C.brandL,c:C.brandD},cancelled:{l:"Cancelled",bg:C.redL,c:C.redD},active:{l:"Active",bg:C.greenL,c:C.greenD},completed:{l:"Done",bg:"#F3F4F6",c:C.ink3}};
  const s=m[v?.toLowerCase()]||{l:v,bg:"#F3F4F6",c:C.ink3};
  return <Pill label={s.l} bg={s.bg} color={s.c}/>;
};

const Stars=({rating,size=14})=>(
  <span style={{color:"#F59E0B",fontSize:size,letterSpacing:1}}>
    {"★".repeat(rating)}{"☆".repeat(5-rating)}
  </span>
);

const Card=({children,style={},onClick,p=14,mb=10})=>(
  <div onClick={onClick} className="up" style={{background:C.surface,borderRadius:C.r,border:`1px solid ${C.border}`,padding:p,marginBottom:mb,boxShadow:"0 1px 3px rgba(0,0,0,.04)",cursor:onClick?"pointer":"default",transition:"box-shadow .15s,transform .15s",...style}}
  onMouseEnter={e=>{if(onClick){e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,.09)";e.currentTarget.style.transform="translateY(-1px)";}}}
  onMouseLeave={e=>{if(onClick){e.currentTarget.style.boxShadow="0 1px 3px rgba(0,0,0,.04)";e.currentTarget.style.transform="translateY(0)";}}}>{children}</div>
);

const SC=({label,value,sub,icon,color=C.brand})=>(
  <div className="up" style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:C.r,padding:"12px 14px",boxShadow:"0 1px 3px rgba(0,0,0,.04)"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
      <span style={{fontSize:10,fontWeight:600,color:C.ink3,textTransform:"uppercase",letterSpacing:".5px"}}>{label}</span>
      <div style={{width:28,height:28,borderRadius:C.rSm,background:`${color}12`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>{icon}</div>
    </div>
    <div style={{fontSize:22,fontWeight:700,color:C.ink,letterSpacing:"-.5px"}}>{value}</div>
    {sub&&<div style={{fontSize:11,color:C.ink4,marginTop:2}}>{sub}</div>}
  </div>
);

const Btn=({label,onClick,variant="primary",icon,loading,full=true,sm})=>{
  const p=sm?"7px 13px":"10px 16px",fs=sm?12:13;
  const vs={primary:{bg:C.brand,c:"#fff",sh:`0 2px 8px ${C.brand}35`},success:{bg:C.green,c:"#fff",sh:`0 2px 8px ${C.green}35`},dark:{bg:C.ink,c:"#fff",sh:"0 2px 8px rgba(0,0,0,.2)"},ghost:{bg:"transparent",c:C.ink2,sh:"none",bo:`1px solid ${C.border}`},danger:{bg:C.redL,c:C.redD,sh:"none"},amber:{bg:C.amberL,c:C.amberD,sh:"none"}};
  const s=vs[variant]||vs.primary;
  return <button onClick={onClick} disabled={loading} style={{width:full?"100%":"auto",background:loading?"#E5E7EB":s.bg,color:loading?C.ink3:s.c,border:s.bo||"none",borderRadius:C.r,padding:p,fontSize:fs,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:6,boxShadow:loading?"none":s.sh,marginBottom:full?10:0,opacity:loading?.75:1,transition:"all .15s"}}>
    {loading?<span style={{animation:"pulse 1.2s ease infinite"}}>Processing…</span>:<>{icon&&<span style={{fontSize:fs+1}}>{icon}</span>}{label}</>}
  </button>;
};

const Inp=({label,value,onChange,type="text",placeholder="",mb=12})=>(
  <div style={{marginBottom:mb}}>
    {label&&<div style={{fontSize:10,fontWeight:600,color:C.ink3,textTransform:"uppercase",letterSpacing:".5px",marginBottom:5}}>{label}</div>}
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>
  </div>
);

const Sel=({label,value,onChange,opts,mb=12})=>(
  <div style={{marginBottom:mb}}>
    {label&&<div style={{fontSize:10,fontWeight:600,color:C.ink3,textTransform:"uppercase",letterSpacing:".5px",marginBottom:5}}>{label}</div>}
    <select value={value} onChange={e=>onChange(e.target.value)}>
      {opts.map(o=>{const v=o.v!=null?o.v:o,l=o.l!=null?o.l:o;return <option key={v} value={v}>{l}</option>;})}
    </select>
  </div>
);

const Divider=({my=12})=><div style={{height:1,background:C.border,margin:`${my}px 0`}}/>;

const SecTitle=({title,action})=>(
  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",margin:"14px 0 8px"}}>
    <span style={{fontSize:10,fontWeight:600,color:C.ink3,textTransform:"uppercase",letterSpacing:".5px"}}>{title}</span>
    {action}
  </div>
);

const PBar=({done,total})=>{
  const pct=total>0?Math.round(done/total*100):0,rem=total-done;
  const col=rem===0?C.green:rem<=2?C.amber:C.brand;
  return <div>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
      <span style={{fontSize:11,color:C.ink3}}>{done} done</span>
      <span style={{fontSize:11,fontWeight:600,color:col}}>{rem} remaining</span>
    </div>
    <div style={{height:5,background:C.border,borderRadius:C.rFull,overflow:"hidden"}}>
      <div style={{height:"100%",width:`${pct}%`,background:col,borderRadius:C.rFull,transition:"width .6s"}}/>
    </div>
    {rem<=2&&rem>0&&<div style={{marginTop:5,fontSize:11,color:C.amberD,fontWeight:500}}>⚠️ Renewal reminder will be sent</div>}
    {rem===0&&<div style={{marginTop:5,fontSize:11,color:C.greenD,fontWeight:500}}>✓ Package complete</div>}
  </div>;
};

const Spin=()=>(
  <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"40px 0",gap:10}}>
    <div style={{width:28,height:28,border:`2.5px solid ${C.border}`,borderTopColor:C.brand,borderRadius:C.rFull,animation:"spin .7s linear infinite"}}/>
    <span style={{fontSize:12,color:C.ink4}}>Loading…</span>
  </div>
);

const Empty=({msg="No data found"})=>(
  <div style={{textAlign:"center",padding:"28px 0",color:C.ink4,fontSize:12}}>{msg}</div>
);

// ── PAGINATION ────────────────────────────────────────────────────────
const Paginator=({page,total,perPage,onChange})=>{
  const pages=Math.ceil(total/perPage);
  if(pages<=1)return null;
  const start=page*perPage+1,end=Math.min((page+1)*perPage,total);
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",marginTop:4}}>
      <span style={{fontSize:11,color:C.ink4}}>{start}–{end} of {total}</span>
      <div style={{display:"flex",gap:4}}>
        <button onClick={()=>onChange(page-1)} disabled={page===0}
          style={{padding:"5px 10px",borderRadius:C.rSm,border:`1px solid ${C.border}`,background:page===0?C.bg:C.surface,color:page===0?C.ink4:C.ink2,fontSize:12,fontWeight:500,opacity:page===0?.5:1}}>←</button>
        {Array.from({length:Math.min(pages,5)},(_,i)=>{
          let p=i;
          if(pages>5&&page>2)p=page-2+i;
          if(p>=pages)return null;
          return <button key={p} onClick={()=>onChange(p)}
            style={{padding:"5px 10px",borderRadius:C.rSm,border:`1px solid ${p===page?C.brand:C.border}`,background:p===page?C.brand:C.surface,color:p===page?"#fff":C.ink2,fontSize:12,fontWeight:p===page?600:400}}>{p+1}</button>;
        })}
        <button onClick={()=>onChange(page+1)} disabled={page>=pages-1}
          style={{padding:"5px 10px",borderRadius:C.rSm,border:`1px solid ${C.border}`,background:page>=pages-1?C.bg:C.surface,color:page>=pages-1?C.ink4:C.ink2,fontSize:12,fontWeight:500,opacity:page>=pages-1?.5:1}}>→</button>
      </div>
    </div>
  );
};

// ── APPOINTMENT CARD ──────────────────────────────────────────────────
const ACard=({a,onMarkPaid})=>{
  const cancelled=a.status==="cancelled";
  const dc=DCOL[a.therapist]||C.brand;
  return (
    <Card style={{borderLeft:`2.5px solid ${cancelled?C.red:dc}`,opacity:cancelled?.6:1}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{textAlign:"center",minWidth:42,flexShrink:0}}>
          <div style={{fontSize:13,fontWeight:600,color:C.ink}}>{a.time}</div>
          <div style={{fontSize:9,color:C.ink4,marginTop:1}}>{a.date?.slice(5)}</div>
        </div>
        <div style={{width:1,height:32,background:C.border,flexShrink:0}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:600,color:C.ink,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",textDecoration:cancelled?"line-through":"none"}}>{a.patientName||"Unknown"}</div>
          <div style={{fontSize:11,color:C.ink3,marginTop:2}}>{a.type} · <span style={{color:dc,fontWeight:500}}>{a.therapist}</span></div>
        </div>
        <div style={{textAlign:"right",flexShrink:0,display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end"}}>
          {cancelled?sPill("cancelled"):sPill(a.payStatus==="paid"?"paid":a.payStatus==="clinic"?"clinic":"pending")}
          <span style={{fontSize:12,fontWeight:600,color:C.ink}}>₹{(a.amount||0).toLocaleString()}</span>
          {!cancelled&&a.payStatus!=="paid"&&onMarkPaid&&(
            <button onClick={e=>{e.stopPropagation();onMarkPaid(a._id);}}
              style={{background:C.greenL,color:C.greenD,border:"none",borderRadius:C.rSm,padding:"3px 9px",fontSize:10,fontWeight:600,cursor:"pointer",marginTop:2}}>
              Mark Paid
            </button>
          )}
        </div>
      </div>
    </Card>
  );
};

// ── LAYOUT COMPONENTS ─────────────────────────────────────────────────
const navItems=[
  {id:"home",    icon:"🏠", label:"Home"},
  {id:"appts",   icon:"📅", label:"Schedule"},
  {id:"patients",icon:"👥", label:"Patients"},
  {id:"billing", icon:"💳", label:"Billing"},
  {id:"earnings",icon:"📊", label:"Earnings"},
  {id:"feedback",icon:"⭐", label:"Feedback"},
];

const Sidebar=({tab,go})=>(
  <div style={{width:220,flexShrink:0,background:C.sidebar,height:"100vh",position:"sticky",top:0,display:"flex",flexDirection:"column",overflowY:"auto"}}>
    <div style={{padding:"20px 16px 16px",borderBottom:"1px solid rgba(255,255,255,.07)"}}>
      <div style={{width:36,height:36,background:C.brand,borderRadius:C.r,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,marginBottom:10}}>⚕️</div>
      <div style={{color:"#fff",fontWeight:700,fontSize:14}}>NexoraaCare</div>
      <div style={{color:"rgba(255,255,255,.4)",fontSize:11,marginTop:2}}>Admin Dashboard</div>
    </div>
    <div style={{padding:"10px 8px",flex:1}}>
      {navItems.map(n=>{
        const active=tab===n.id;
        return <button key={n.id} onClick={()=>go(n.id)} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"9px 10px",borderRadius:C.r,background:active?"rgba(8,145,178,.25)":"transparent",border:active?`1px solid rgba(8,145,178,.4)`:"1px solid transparent",color:active?"#fff":"rgba(255,255,255,.55)",fontSize:13,fontWeight:active?600:400,marginBottom:2,textAlign:"left",transition:"all .15s",cursor:"pointer"}}>
          <span style={{fontSize:17}}>{n.icon}</span>{n.label}
        </button>;
      })}
    </div>
    <div style={{padding:"12px 16px",borderTop:"1px solid rgba(255,255,255,.07)"}}>
      <div style={{fontSize:11,color:"rgba(255,255,255,.3)"}}>NexoraaCare v2.0</div>
    </div>
  </div>
);

const BottomNav=({tab,go})=>(
  <div style={{position:"fixed",bottom:0,left:0,right:0,background:"rgba(255,255,255,.97)",backdropFilter:"blur(10px)",borderTop:`1px solid ${C.border}`,display:"grid",gridTemplateColumns:`repeat(${navItems.length},1fr)`,zIndex:100}}>
    {navItems.map(n=>{
      const on=tab===n.id;
      return <button key={n.id} onClick={()=>go(n.id)} style={{background:"none",border:"none",padding:"8px 0 6px",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
        <span style={{fontSize:18,filter:on?"none":"grayscale(1) opacity(.4)",transition:"filter .15s"}}>{n.icon}</span>
        <span style={{fontSize:9,fontWeight:on?600:500,color:on?C.brand:C.ink4,letterSpacing:".2px"}}>{n.label}</span>
        {on&&<div style={{width:14,height:2,background:C.brand,borderRadius:1,marginTop:1}}/>}
      </button>;
    })}
  </div>
);

const TopBar=({title,sub,onBack,right,icon="⚕️"})=>(
  <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"11px 16px",display:"flex",alignItems:"center",gap:10,position:"sticky",top:0,zIndex:50}}>
    {onBack?<button onClick={onBack} style={{width:32,height:32,background:C.bg,border:`1px solid ${C.border}`,borderRadius:C.rSm,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,color:C.ink2,flexShrink:0}}>‹</button>
    :<div style={{width:30,height:30,background:C.brand,borderRadius:C.rSm,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0}}>{icon}</div>}
    <div style={{flex:1,minWidth:0}}>
      <div style={{fontSize:14,fontWeight:600,color:C.ink,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{title}</div>
      {sub&&<div style={{fontSize:11,color:C.ink4,marginTop:1}}>{sub}</div>}
    </div>
    {right}
  </div>
);

const RefBtn=({onClick,label})=>(
  <button onClick={onClick} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:C.rSm,padding:"5px 9px",fontSize:11,fontWeight:500,color:C.ink3,display:"flex",alignItems:"center",gap:4,flexShrink:0}}>🔄 {label||"Refresh"}</button>
);

// ── MAIN APP ──────────────────────────────────────────────────────────
const Shell=({children,hdr,isDesktop,tab,go})=>(
  <div style={{display:"flex",minHeight:"100vh",background:C.bg}}>
    <style>{css}</style>
    {isDesktop&&<Sidebar tab={tab} go={go}/>}
    <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,maxWidth:isDesktop?"none":"100%"}}>
      {hdr}
      <div style={{padding:isDesktop?"20px 24px":"12px 14px",paddingBottom:isDesktop?"20px":"82px",flex:1,overflowY:"auto"}}>
        {children}
      </div>
    </div>
    {!isDesktop&&<BottomNav tab={tab} go={go}/>}
  </div>
);

export default function App(){
  const w = useW();
  const isDesktop = w >= 1024;
  const isMobile  = w < 640;

  const [tab,    setTab]    = useState("home");
  const [screen, setScreen] = useState(null);
  const [selP,   setSelP]   = useState(null);

  const [patients,  setPatients]  = useState([]);
  const [appts,     setAppts]     = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [refresh,   setRefresh]   = useState(null);
  const [sending,   setSending]   = useState(false);

  // Pagination
  const [pPatients, setPPatients] = useState(0);
  const [pAppts,    setPAppts]    = useState(0);
  const [pBilling,  setPBilling]  = useState(0);
  const [pFeedback, setPFeedback] = useState(0);

  // Patient detail state
  const [tx,       setTx]       = useState("");
  const [savingTx, setSavingTx] = useState(false);
  const [txOk,     setTxOk]     = useState(false);
  const [pkgs,     setPkgs]     = useState([]);
  const [ldPkgs,   setLdPkgs]   = useState(false);
  const [showPkg,  setShowPkg]  = useState(false);
  const [markPkg,  setMarkPkg]  = useState(null);
  const [npkg,     setNpkg]     = useState({name:"",total:"10",amount:"",therapist:DOCS[0],startDate:TODAY});

  // Book appointment state
  const [patMode,  setPatMode]  = useState("existing"); // "existing" | "new"
  const [na,  setNa]  = useState({patientId:"",therapist:DOCS[0],date:TODAY,time:"09:00",type:TYPES[0],amount:"1800",payStatus:"pending"});
  const [nap, setNap] = useState({name:"",phone:"",condition:""}); // new patient in booking

  // Add patient form
  const [np, setNp] = useState({name:"",phone:"",condition:"",dob:"",address:"",email:"",notes:""});

  // Earnings
  const [earningDoc,   setEarningDoc]   = useState("all");
  const [earningPeriod,setEarningPeriod]= useState("month");

  // Search + filter
  const [search,      setSearch]      = useState("");
  const [apptFilter,  setApptFilter]  = useState("all"); // all, today, confirmed, cancelled

  const notify = msg => { /* silent - no popup */ console.log("Notif:", msg); };

  // ── DATA ──────────────────────────────────────────────────────────
  const load = async()=>{
    setLoading(true);
    try{
      const [pR,aR,fR]=await Promise.all([
        fetch(`${API}/api/patients`),
        fetch(`${API}/api/appointments`),
        fetch(`${API}/api/feedback`),
      ]);
      setPatients(await pR.json());
      setAppts(await aR.json());
      setFeedbacks(await fR.json());
      setRefresh(new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}));
    }catch(e){console.error(e);}
    setLoading(false);
  };

  useEffect(()=>{load();},[]);

  useEffect(()=>{
    if(!selP){setPkgs([]);return;}
    setTx(selP.treatment||"");
    (async()=>{
      setLdPkgs(true);
      try{const r=await fetch(`${API}/api/packages/${selP._id}`);setPkgs(await r.json());}
      catch(e){setPkgs([]);}
      setLdPkgs(false);
    })();
  },[selP]);

  const go=id=>{setTab(id);setScreen(null);setSelP(null);setPPatients(0);setPAppts(0);setPBilling(0);};

  // ── ACTIONS ───────────────────────────────────────────────────────
  const markPaid=async(apptId)=>{
    try{
      const r=await fetch(`${API}/api/appointments/${apptId}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({payStatus:"paid"})});
      const updated=await r.json();
      setAppts(prev=>prev.map(a=>a._id===apptId?{...a,payStatus:"paid"}:a));
    }catch(e){alert("Error updating payment.");}
  };

  const markSession=async(pkg)=>{
    if(pkg.done>=pkg.total)return;
    setMarkPkg(pkg._id);
    try{
      const r=await fetch(`${API}/api/packages/${pkg._id}/mark-session`,{method:"POST"});
      const d=await r.json();
      setPkgs(p=>p.map(x=>x._id===pkg._id?d.updated:x));
    }catch(e){alert("Error. Check connection.");}
    setMarkPkg(null);
  };

  const addPkg=async()=>{
    if(!npkg.name||!npkg.total){alert("Name and sessions required.");return;}
    try{
      const r=await fetch(`${API}/api/packages`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...npkg,total:parseInt(npkg.total),amount:parseInt(npkg.amount)||0,done:0,active:true,patientId:selP._id,patientName:selP.name,patientPhone:selP.phone})});
      const saved=await r.json();
      setPkgs(p=>[saved,...p]);
      setNpkg({name:"",total:"10",amount:"",therapist:DOCS[0],startDate:TODAY});
      setShowPkg(false);
    }catch(e){alert("Error saving.");}
  };

  const saveTx=async()=>{
    if(!selP)return;
    setSavingTx(true);
    try{
      await fetch(`${API}/api/patients/${selP._id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({treatment:tx})});
      setPatients(p=>p.map(x=>x._id===selP._id?{...x,treatment:tx}:x));
      setSelP(p=>({...p,treatment:tx}));
      setTxOk(true);setTimeout(()=>setTxOk(false),3000);
    }catch(e){alert("Error saving.");}
    setSavingTx(false);
  };

  const saveAppt=async()=>{
    const apptErrs=validateForm({date:na.date,time:na.time});
    if(Object.keys(apptErrs).length){alert(Object.values(apptErrs)[0]);return;}
    try{
      let patientId="",patientName="",patientPhone="";
      if(patMode==="new"){
        const patErrs=validateForm({name:nap.name,phone:nap.phone});
        if(Object.keys(patErrs).length){alert(Object.values(patErrs)[0]);return;}
        const pr=await fetch(`${API}/api/patients`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:nap.name,phone:nap.phone,condition:nap.condition})});
        const savedPat=await pr.json();
        patientId=savedPat._id;patientName=savedPat.name;patientPhone=savedPat.phone;
        setPatients(p=>[savedPat,...p]);
      }else{
        if(!na.patientId){alert("Select a patient.");return;}
        const pt=patients.find(p=>p._id===na.patientId);
        patientId=pt._id;patientName=pt.name;patientPhone=pt.phone;
      }
      const r=await fetch(`${API}/api/appointments`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...na,patientId,patientName,patientPhone,amount:parseInt(na.amount)})});
      const saved=await r.json();
      setAppts(a=>[saved,...a]);
      setNa({patientId:"",therapist:DOCS[0],date:TODAY,time:"09:00",type:TYPES[0],amount:"1800",payStatus:"pending"});
      setNap({name:"",phone:"",condition:""});
      setPatMode("existing");
      setScreen(null);
    }catch(e){alert("Error saving appointment.");}
  };

  const savePat=async()=>{
    const errs=validateForm({name:np.name,phone:np.phone,email:np.email});
    if(Object.keys(errs).length){alert(Object.values(errs)[0]);return;}
    try{
      const r=await fetch(`${API}/api/patients`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(np)});
      const saved=await r.json();
      setPatients(p=>[saved,...p]);
      setNp({name:"",phone:"",condition:"",dob:"",address:"",email:"",notes:""});
      setScreen(null);
    }catch(e){alert("Error saving.");}
  };

  const sendSched=async()=>{
    setSending(true);
    try{const r=await fetch(`${API}/api/send-schedule`);const d=await r.json();alert(d.success?"✅ Schedule sent!":"❌ "+d.error);}
    catch(e){alert("❌ Could not connect.");}
    setSending(false);
  };

  const sendFeedback=async(apptId)=>{
    try{
      await fetch(`${API}/api/send-feedback/${apptId}`,{method:"POST"});
      alert("✅ Feedback request sent to patient!");
    }catch(e){alert("Error sending feedback request.");}
  };

  // ── DERIVED ───────────────────────────────────────────────────────
  const todayA  = appts.filter(a=>a.date===TODAY&&a.status!=="cancelled");
  const todayPaid = todayA.filter(a=>a.payStatus==="paid").reduce((s,a)=>s+(a.amount||0),0);

  const filtAppts = useMemo(()=>{
    let list=appts;
    if(apptFilter==="today")     list=list.filter(a=>a.date===TODAY);
    else if(apptFilter==="confirmed") list=list.filter(a=>a.status==="confirmed");
    else if(apptFilter==="cancelled") list=list.filter(a=>a.status==="cancelled");
    if(search&&tab==="appts") list=list.filter(a=>(a.patientName||"").toLowerCase().includes(search.toLowerCase()));
    return list;
  },[appts,apptFilter,search,tab]);

  const filtPats = useMemo(()=>patients.filter(p=>
    (p.name||"").toLowerCase().includes(search.toLowerCase())||
    (p.phone||"").includes(search)||
    (p.condition||"").toLowerCase().includes(search.toLowerCase())
  ),[patients,search]);

  const patAppts=id=>appts.filter(a=>String(a.patientId?._id||a.patientId)===String(id)||a.patientPhone===patients.find(p=>String(p._id)===String(id))?.phone);

  // Earnings computation
  const earnings = useMemo(()=>{
    const docFilter = earningDoc==="all"?DOCS:[earningDoc];
    let list=appts.filter(a=>a.status!=="cancelled"&&docFilter.includes(a.therapist));
    const now=new Date();
    if(earningPeriod==="today") list=list.filter(a=>a.date===TODAY);
    else if(earningPeriod==="week"){
      const wStart=new Date(now);wStart.setDate(now.getDate()-7);
      list=list.filter(a=>a.date>=wStart.toISOString().split("T")[0]);
    }else if(earningPeriod==="month"){
      list=list.filter(a=>a.date?.startsWith(TODAY.slice(0,7)));
    }
    const total=list.reduce((s,a)=>s+(a.amount||0),0);
    const paid=list.filter(a=>a.payStatus==="paid").reduce((s,a)=>s+(a.amount||0),0);
    const pending=list.filter(a=>a.payStatus==="pending").reduce((s,a)=>s+(a.amount||0),0);
    const clinic=list.filter(a=>a.payStatus==="clinic").reduce((s,a)=>s+(a.amount||0),0);
    // By doc
    const byDoc=DOCS.map(d=>{const da=list.filter(a=>a.therapist===d);return{doc:d,count:da.length,total:da.reduce((s,a)=>s+(a.amount||0),0),paid:da.filter(a=>a.payStatus==="paid").reduce((s,a)=>s+(a.amount||0),0)};});
    // Monthly
    const monthly={};
    appts.filter(a=>a.status!=="cancelled"&&docFilter.includes(a.therapist)).forEach(a=>{
      if(!a.date)return;
      const k=a.date.slice(0,7);
      if(!monthly[k])monthly[k]={key:k,total:0,paid:0};
      monthly[k].total+=(a.amount||0);
      if(a.payStatus==="paid")monthly[k].paid+=(a.amount||0);
    });
    return{total,paid,pending,clinic,count:list.length,byDoc,monthly:Object.values(monthly).sort((a,b)=>b.key.localeCompare(a.key)).slice(0,12)};
  },[appts,earningDoc,earningPeriod]);

  // ── SHELL ──────────────────────────────────────────────────────────
  const date=new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"});

  // ── HOME ──────────────────────────────────────────────────────────
  if(tab==="home"&&!screen) return <Shell isDesktop={isDesktop} tab={tab} go={go} hdr={<TopBar title="NexoraaCare" sub={date} right={<RefBtn onClick={load} label={refresh||"Live"}/>}/>}>
    {loading?<Spin/>:<>
      <div className={isDesktop?"grid4":"grid2"} style={{marginBottom:14}}>
        <SC label="Today" value={todayA.length} sub="appointments" icon="📅" color={C.brand}/>
        <SC label="Today Paid" value={`₹${todayPaid.toLocaleString()}`} sub="collected today" icon="💵" color={C.green}/>
        <SC label="Patients" value={patients.length} sub="registered" icon="👥" color={C.purple}/>
        <SC label="Total Paid" value={`₹${(appts.filter(a=>a.payStatus==="paid").reduce((s,a)=>s+(a.amount||0),0)/1000).toFixed(1)}k`} sub="all time" icon="💰" color={C.green}/>
      </div>

      <Card p={14} style={{background:C.green,border:"none",marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
          <div style={{width:36,height:36,borderRadius:C.rSm,background:"rgba(255,255,255,.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>📤</div>
          <div>
            <div style={{color:"#fff",fontWeight:600,fontSize:13}}>Send Today's Schedule</div>
            <div style={{color:"rgba(255,255,255,.65)",fontSize:11,marginTop:1}}>{todayA.length} appointments today</div>
          </div>
        </div>
        <button onClick={sendSched} disabled={sending} style={{width:"100%",background:"rgba(255,255,255,.2)",border:"1px solid rgba(255,255,255,.25)",color:"#fff",borderRadius:C.rSm,padding:"9px 0",fontSize:13,fontWeight:600,opacity:sending?.7:1}}>
          {sending?<span style={{animation:"pulse 1.2s ease infinite"}}>Sending…</span>:"Send Now"}
        </button>
      </Card>

      <SecTitle title={`Today's Appointments · ${todayA.length}`}/>
      {todayA.length===0?<Card><Empty msg="No appointments today"/></Card>
        :todayA.sort((a,b)=>a.time.localeCompare(b.time)).map(a=><ACard key={a._id} a={a} onMarkPaid={markPaid}/>)
      }
    </>}
  </Shell>;

  // ── SCHEDULE ──────────────────────────────────────────────────────
  if(tab==="appts"&&!screen) return <Shell isDesktop={isDesktop} tab={tab} go={go} hdr={<TopBar title="Schedule" sub={`${appts.length} total`} icon="📅" right={<RefBtn onClick={load} label={refresh}/>}/>}>
    <Btn label="Book New Appointment" onClick={()=>setScreen("add")} icon="+" variant="dark"/>
    {/* Filters */}
    <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
      {["all","today","confirmed","cancelled"].map(f=>(
        <button key={f} onClick={()=>{setApptFilter(f);setPAppts(0);}} style={{padding:"6px 12px",borderRadius:C.rFull,border:`1px solid ${apptFilter===f?C.brand:C.border}`,background:apptFilter===f?C.brand:"transparent",color:apptFilter===f?"#fff":C.ink3,fontSize:11,fontWeight:apptFilter===f?600:400,cursor:"pointer",transition:"all .15s",textTransform:"capitalize"}}>{f==="all"?"All":f==="today"?"Today":f}</button>
      ))}
      <div style={{position:"relative",flex:1,minWidth:120}}>
        <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",fontSize:13,color:C.ink4,pointerEvents:"none"}}>🔍</span>
        <input value={search} onChange={e=>{setSearch(e.target.value);setPAppts(0);}} placeholder="Search patient…" style={{paddingLeft:28,fontSize:12}}/>
      </div>
    </div>
    {loading?<Spin/>:<>
      {filtAppts.slice(pAppts*PER,(pAppts+1)*PER).map(a=><ACard key={a._id} a={a} onMarkPaid={markPaid}/>)}
      {filtAppts.length===0&&<Card><Empty msg="No appointments found"/></Card>}
      <Paginator page={pAppts} total={filtAppts.length} perPage={PER} onChange={setPAppts}/>
    </>}
  </Shell>;

  if(tab==="appts"&&screen==="add") return <Shell isDesktop={isDesktop} tab={tab} go={go} hdr={<TopBar title="New Appointment" onBack={()=>setScreen(null)}/>}>
    <Card>
      {/* Toggle: existing vs new patient */}
      <div style={{display:"flex",background:C.bg,borderRadius:C.r,padding:3,marginBottom:14,border:`1px solid ${C.border}`}}>
        {[["existing","Existing Patient"],["new","New Patient"]].map(([v,l])=>(
          <button key={v} onClick={()=>setPatMode(v)} style={{flex:1,padding:"8px 0",borderRadius:C.rSm,border:"none",background:patMode===v?C.surface:C.bg,color:patMode===v?C.ink:C.ink3,fontSize:12,fontWeight:patMode===v?600:400,boxShadow:patMode===v?"0 1px 3px rgba(0,0,0,.08)":"none",transition:"all .15s",cursor:"pointer"}}>{l}</button>
        ))}
      </div>

      {patMode==="existing"?(
        <Sel label="Select Patient" value={na.patientId} onChange={v=>setNa({...na,patientId:v})}
          opts={[{v:"",l:"Choose patient…"},...patients.map(p=>({v:p._id,l:`${p.name}  ·  ${p.phone}`}))]}/>
      ):(
        <div style={{background:C.bg,borderRadius:C.r,padding:12,marginBottom:12,border:`1px solid ${C.border}`}}>
          <div style={{fontSize:11,fontWeight:600,color:C.brand,marginBottom:10}}>New Patient Details</div>
          <Inp label="Full Name *" value={nap.name} onChange={v=>setNap({...nap,name:v})} placeholder="Patient's full name"/>
          <Inp label="Phone *" value={nap.phone} onChange={v=>setNap({...nap,phone:v})} placeholder="10-digit number"/>
          <Inp label="Condition / Complaint" value={nap.condition} onChange={v=>setNap({...nap,condition:v})} placeholder="e.g. Back pain, Knee pain" mb={0}/>
        </div>
      )}

      <Sel label="Therapist" value={na.therapist} onChange={v=>setNa({...na,therapist:v})} opts={DOCS}/>
      <div className="grid2" style={{marginBottom:12}}>
        <Inp label="Date" value={na.date} onChange={v=>setNa({...na,date:v})} type="date" mb={0}/>
        <Sel label="Time" value={na.time} onChange={v=>setNa({...na,time:v})} opts={TIMES} mb={0}/>
      </div>
      <Sel label="Appointment Type" value={na.type} onChange={v=>setNa({...na,type:v,amount:String(PRICES[v]||1200)})} opts={TYPES}/>
      <div style={{background:C.brandXL,border:`1px solid ${C.brandL}`,borderRadius:C.r,padding:"11px 14px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:12,color:C.ink3}}>Consultation Fee</span>
        <span style={{fontSize:18,fontWeight:700,color:C.brand}}>₹{parseInt(na.amount||0).toLocaleString()}</span>
      </div>
      <Sel label="Payment" value={na.payStatus} onChange={v=>setNa({...na,payStatus:v})}
        opts={[{v:"pending",l:"Pending"},{v:"paid",l:"Paid ✓"},{v:"clinic",l:"Pay at Clinic"}]}/>
      <Btn label="Confirm Appointment" onClick={saveAppt} icon="✓"/>
    </Card>
  </Shell>;

  // ── PATIENTS ──────────────────────────────────────────────────────
  if(tab==="patients"&&!screen&&!selP) return <Shell isDesktop={isDesktop} tab={tab} go={go} hdr={<TopBar title="Patients" sub={`${patients.length} registered`} icon="👥" right={<RefBtn onClick={load} label={refresh}/>}/>}>
    <Btn label="Register New Patient" onClick={()=>setScreen("add")} icon="+" variant="dark"/>
    <div style={{position:"relative",marginBottom:12}}>
      <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",fontSize:14,color:C.ink4,pointerEvents:"none"}}>🔍</span>
      <input value={search} onChange={e=>{setSearch(e.target.value);setPPatients(0);}} placeholder="Search name, phone or condition…" style={{paddingLeft:28}}/>
    </div>
    {loading?<Spin/>:<>
      <div style={{display:isDesktop?"grid":"block",gridTemplateColumns:isDesktop?"1fr 1fr 1fr":"none",gap:10}}>
        {filtPats.slice(pPatients*PER,(pPatients+1)*PER).map(p=>{
          const visits=patAppts(p._id).length;
          return <Card key={p._id} onClick={()=>{setSelP(p);setScreen("detail");}} mb={isDesktop?0:8}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <Avatar name={p.name} size={38}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,color:C.ink}}>{p.name}</div>
                <div style={{fontSize:11,color:C.ink3,marginTop:2}}>📱 {p.phone}</div>
                {p.condition&&<div style={{fontSize:11,color:C.brand,fontWeight:500,marginTop:2}}>🩺 {p.condition}</div>}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end",flexShrink:0}}>
                {p.treatment&&<Pill label="Tx ✓" bg={C.greenL} color={C.greenD}/>}
                <span style={{fontSize:10,color:C.ink4}}>{visits} visit{visits!==1?"s":""}</span>
                <span style={{color:C.ink4,fontSize:14}}>›</span>
              </div>
            </div>
          </Card>;
        })}
      </div>
      {filtPats.length===0&&<Card><Empty msg="No patients found"/></Card>}
      <Paginator page={pPatients} total={filtPats.length} perPage={PER} onChange={setPPatients}/>
    </>}
  </Shell>;

  if(tab==="patients"&&screen==="add") return <Shell isDesktop={isDesktop} tab={tab} go={go} hdr={<TopBar title="Register Patient" onBack={()=>setScreen(null)}/>}>
    <Card>
      <div className="grid2">
        <div style={{gridColumn:"1/-1"}}><Inp label="Full Name *" value={np.name} onChange={v=>setNp({...np,name:v})} placeholder="Patient's full name"/></div>
        <Inp label="Phone *" value={np.phone} onChange={v=>setNp({...np,phone:v})} placeholder="10-digit" mb={0}/>
        <Inp label="Date of Birth" value={np.dob} onChange={v=>setNp({...np,dob:v})} type="date" mb={0}/>
      </div>
      <div style={{marginBottom:12}}/>
      <Inp label="Condition / Complaint" value={np.condition} onChange={v=>setNp({...np,condition:v})} placeholder="e.g. Lower back pain"/>
      <Inp label="Address" value={np.address} onChange={v=>setNp({...np,address:v})} placeholder="Area, City"/>
      <Inp label="Email" value={np.email} onChange={v=>setNp({...np,email:v})} placeholder="patient@email.com"/>
      <div style={{marginBottom:12}}>
        <div style={{fontSize:10,fontWeight:600,color:C.ink3,textTransform:"uppercase",letterSpacing:".5px",marginBottom:5}}>Notes</div>
        <textarea value={np.notes} onChange={e=>setNp({...np,notes:e.target.value})} rows={3} placeholder="Additional information…" style={{resize:"vertical"}}/>
      </div>
      <Btn label="Save Patient" onClick={savePat} icon="✓"/>
    </Card>
  </Shell>;

  // ── PATIENT DETAIL ────────────────────────────────────────────────
  if(tab==="patients"&&screen==="detail"&&selP) return <Shell isDesktop={isDesktop} tab={tab} go={go} hdr={<TopBar title="Patient Profile" onBack={()=>{setScreen(null);setSelP(null);setPkgs([]);}}/>}>
    <Card p={0} style={{overflow:"hidden"}}>
      <div style={{background:`linear-gradient(to bottom,${C.brandXL},${C.surface})`,padding:"16px 14px 12px"}}>
        <div style={{display:"flex",gap:12,alignItems:"center"}}>
          <Avatar name={selP.name} size={50}/>
          <div style={{flex:1}}>
            <div style={{fontSize:17,fontWeight:700,color:C.ink}}>{selP.name}</div>
            <div style={{fontSize:12,color:C.ink3,marginTop:2}}>📱 {selP.phone}</div>
            {selP.condition&&<div style={{display:"inline-flex",alignItems:"center",gap:4,marginTop:6,background:C.brandL,color:C.brandD,padding:"2px 9px",borderRadius:C.rFull,fontSize:11,fontWeight:500}}>🩺 {selP.condition}</div>}
          </div>
        </div>
        <div className="grid2" style={{marginTop:12}}>
          {[["📍","Address",selP.address],["✉️","Email",selP.email],["🗓️","DOB",selP.dob],["📅","Joined",new Date(selP.createdAt).toLocaleDateString("en-IN")]].filter(([,,v])=>v).map(([icon,k,v])=>(
            <div key={k} style={{background:"rgba(255,255,255,.75)",border:`1px solid ${C.border}`,borderRadius:C.rSm,padding:"7px 10px"}}>
              <div style={{fontSize:9,fontWeight:600,color:C.ink4,textTransform:"uppercase",letterSpacing:".4px",marginBottom:2}}>{icon} {k}</div>
              <div style={{fontSize:11,fontWeight:600,color:C.ink}}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>

    <SecTitle title="Treatment Packages" action={
      <button onClick={()=>setShowPkg(v=>!v)} style={{background:showPkg?C.redL:C.brandL,color:showPkg?C.redD:C.brandD,border:"none",borderRadius:C.rFull,padding:"4px 12px",fontSize:11,fontWeight:600}}>
        {showPkg?"✕ Cancel":"+ Add Package"}
      </button>
    }/>
    {showPkg&&<Card style={{border:`1px solid ${C.brandL}`,background:C.brandXL}}>
      <div style={{fontSize:12,fontWeight:600,color:C.brandD,marginBottom:12}}>📦 New Package</div>
      <Inp label="Package Name *" value={npkg.name} onChange={v=>setNpkg({...npkg,name:v})} placeholder="e.g. 10-Session Back Therapy"/>
      <div className="grid2">
        <Inp label="Total Sessions *" value={npkg.total} onChange={v=>setNpkg({...npkg,total:v})} type="number" mb={0}/>
        <Inp label="Amount (₹)" value={npkg.amount} onChange={v=>setNpkg({...npkg,amount:v})} type="number" mb={0}/>
      </div>
      <div style={{marginBottom:12}}/>
      <Sel label="Therapist" value={npkg.therapist} onChange={v=>setNpkg({...npkg,therapist:v})} opts={DOCS}/>
      <Inp label="Start Date" value={npkg.startDate} onChange={v=>setNpkg({...npkg,startDate:v})} type="date"/>
      <Btn label="Create Package" onClick={addPkg} variant="success" icon="✓"/>
    </Card>}

    {ldPkgs?<Spin/>:pkgs.length===0?<Card><Empty msg="No packages yet."/></Card>
      :pkgs.map(pkg=>{
        const rem=pkg.total-pkg.done;
        const low=rem<=2&&rem>0&&pkg.active;
        return <Card key={pkg._id} style={{border:`1px solid ${!pkg.active?C.border:low?C.amber:C.brand}22`,background:low?`${C.amberL}40`:C.surface}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
            <div style={{flex:1,paddingRight:10,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:600,color:C.ink}}>{pkg.name}</div>
              <div style={{fontSize:11,color:C.ink3,marginTop:2}}><span style={{color:DCOL[pkg.therapist]||C.brand,fontWeight:500}}>{pkg.therapist}</span>{pkg.startDate&&` · ${pkg.startDate}`}</div>
              {pkg.amount>0&&<div style={{fontSize:11,fontWeight:600,color:C.greenD,marginTop:2}}>₹{pkg.amount.toLocaleString()}</div>}
            </div>
            {sPill(pkg.active?"active":"completed")}
          </div>
          <PBar done={pkg.done} total={pkg.total}/>
          {pkg.active&&<button onClick={()=>markSession(pkg)} disabled={markPkg===pkg._id||rem===0}
            style={{marginTop:10,width:"100%",background:rem===0?"#F3F4F6":`linear-gradient(to right,${C.green},#10B981)`,color:rem===0?C.ink3:"#fff",border:"none",borderRadius:C.r,padding:"10px 0",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:7,boxShadow:rem===0?"none":`0 2px 8px ${C.green}30`,opacity:markPkg===pkg._id?.7:1,transition:"all .15s"}}>
            {markPkg===pkg._id?<span style={{animation:"pulse 1.2s ease infinite"}}>Marking…</span>:rem===0?"✓ All Sessions Done":<>✓ Mark Today's Session Done <span style={{background:"rgba(255,255,255,.2)",padding:"1px 8px",borderRadius:C.rFull,fontSize:10}}>{rem} left</span></>}
          </button>}
        </Card>;
      })
    }

    <SecTitle title="Doctor's Treatment Plan" action={txOk&&<Pill label="✓ Saved" bg={C.greenL} color={C.greenD}/>}/>
    <Card style={{border:`1px solid ${txOk?C.green:C.border}22`}}>
      <div style={{fontSize:11,color:C.ink3,marginBottom:8}}>Internal notes — not shared with patient</div>
      <textarea value={tx} onChange={e=>setTx(e.target.value)} rows={6}
        placeholder={`Treatment plan for ${selP.name}…\n\nExample:\n• Manual therapy: 3× per week\n• Ultrasound: 10 min/session\n• Review after 2 weeks`}
        style={{resize:"vertical",lineHeight:1.65,fontSize:12}}/>
      <div style={{marginTop:10}}/>
      <Btn label={savingTx?"Saving…":"💾 Save Treatment Plan"} onClick={saveTx} variant="success" loading={savingTx}/>
    </Card>

    <SecTitle title={`Appointment History · ${patAppts(selP._id).length}`}/>
    {patAppts(selP._id).length===0?<Card><Empty msg="No appointments yet"/></Card>
      :patAppts(selP._id).sort((a,b)=>b.date.localeCompare(a.date)).map(a=>(
        <div key={a._id}>
          <ACard a={a} onMarkPaid={markPaid}/>
          {a.status==="confirmed"&&<div style={{marginTop:-6,marginBottom:8,textAlign:"right"}}>
            <button onClick={()=>sendFeedback(a._id)} style={{background:C.amberL,color:C.amberD,border:"none",borderRadius:C.rSm,padding:"4px 10px",fontSize:10,fontWeight:600,cursor:"pointer"}}>
              ⭐ Request Feedback
            </button>
          </div>}
        </div>
      ))
    }
  </Shell>;

  // ── BILLING ───────────────────────────────────────────────────────
  if(tab==="billing"&&!screen){
    const monthlyMap={};
    appts.filter(a=>a.status!=="cancelled").forEach(a=>{
      if(!a.date)return;
      const k=a.date.slice(0,7);
      if(!monthlyMap[k])monthlyMap[k]={key:k,appts:[],paid:0,clinic:0,pending:0,total:0};
      monthlyMap[k].appts.push(a);
      monthlyMap[k].total+=(a.amount||0);
      if(a.payStatus==="paid")monthlyMap[k].paid+=(a.amount||0);
      else if(a.payStatus==="clinic")monthlyMap[k].clinic+=(a.amount||0);
      else monthlyMap[k].pending+=(a.amount||0);
    });
    const months=Object.values(monthlyMap).sort((a,b)=>b.key.localeCompare(a.key));
    const mName=k=>{const[y,m]=k.split("-");return new Date(y,m-1).toLocaleDateString("en-IN",{month:"long",year:"numeric"});};
    const allPaid=appts.filter(a=>a.payStatus==="paid").reduce((s,a)=>s+(a.amount||0),0);
    const allClinic=appts.filter(a=>a.payStatus==="clinic").reduce((s,a)=>s+(a.amount||0),0);
    const allPending=appts.filter(a=>a.payStatus==="pending"&&a.status!=="cancelled").reduce((s,a)=>s+(a.amount||0),0);
    return <Shell isDesktop={isDesktop} tab={tab} go={go} hdr={<TopBar title="Billing & Invoices" sub="Monthly breakdown" icon="💳" right={<RefBtn onClick={load} label={refresh}/>}/>}>
      {loading?<Spin/>:<>
        <div className={isDesktop?"grid4":"grid3"} style={{marginBottom:14}}>
          <SC label="Today Paid" icon="📅" value={`₹${todayPaid.toLocaleString()}`} color={C.brand}/>
          <SC label="Collected" icon="✅" value={`₹${(allPaid/1000).toFixed(1)}k`} color={C.green}/>
          <SC label="At Clinic" icon="🏥" value={`₹${(allClinic/1000).toFixed(1)}k`} color={C.amber}/>
          <SC label="Pending" icon="⚠️" value={`₹${(allPending/1000).toFixed(1)}k`} color={C.red}/>
        </div>
        <SecTitle title={`Monthly Invoices · ${months.length}`}/>
        {months.length===0?<Card><Empty msg="No billing data"/></Card>:months.map(m=>{
          const pct=m.total>0?Math.round(m.paid/m.total*100):0;
          const isCurrent=m.key===TODAY.slice(0,7);
          return <Card key={m.key} onClick={()=>setScreen("inv-"+m.key)} style={{border:`1px solid ${isCurrent?C.brand:C.border}`,background:isCurrent?C.brandXL:C.surface}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:C.ink,display:"flex",alignItems:"center",gap:6}}>
                  {mName(m.key)}{isCurrent&&<Pill label="Current" bg={C.brandL} color={C.brandD}/>}
                </div>
                <div style={{fontSize:11,color:C.ink3,marginTop:2}}>{m.appts.length} appointments</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:16,fontWeight:700,color:C.ink}}>₹{m.total.toLocaleString()}</div>
                <div style={{fontSize:10,color:C.ink4}}>total billed</div>
              </div>
            </div>
            <div style={{height:4,background:C.border,borderRadius:C.rFull,overflow:"hidden",marginBottom:8}}>
              <div style={{height:"100%",width:`${pct}%`,background:C.green,borderRadius:C.rFull}}/>
            </div>
            <div className="grid3">
              {[{l:"Paid",v:m.paid,c:C.greenD,bg:C.greenL},{l:"Clinic",v:m.clinic,c:C.amberD,bg:C.amberL},{l:"Pending",v:m.pending,c:C.redD,bg:C.redL}].map(s=>(
                <div key={s.l} style={{background:s.bg,borderRadius:C.rSm,padding:"5px 8px",textAlign:"center"}}>
                  <div style={{fontSize:9,fontWeight:600,color:s.c,textTransform:"uppercase",letterSpacing:".3px"}}>{s.l}</div>
                  <div style={{fontSize:12,fontWeight:700,color:s.c,marginTop:2}}>₹{s.v.toLocaleString()}</div>
                </div>
              ))}
            </div>
            <div style={{textAlign:"right",marginTop:8,fontSize:11,color:C.brand,fontWeight:500}}>View Invoice →</div>
          </Card>;
        })}
      </>}
    </Shell>;
  }

  if(tab==="billing"&&screen?.startsWith("inv-")){
    const mk=screen.replace("inv-","");
    const mAppts=appts.filter(a=>a.date?.startsWith(mk)&&a.status!=="cancelled").sort((a,b)=>a.date.localeCompare(b.date));
    const paid=mAppts.filter(a=>a.payStatus==="paid").reduce((s,a)=>s+(a.amount||0),0);
    const clinic=mAppts.filter(a=>a.payStatus==="clinic").reduce((s,a)=>s+(a.amount||0),0);
    const pending=mAppts.filter(a=>a.payStatus==="pending").reduce((s,a)=>s+(a.amount||0),0);
    const total=paid+clinic+pending;
    const[y,m]=mk.split("-");
    const mn=new Date(y,m-1).toLocaleDateString("en-IN",{month:"long",year:"numeric"});
    return <Shell isDesktop={isDesktop} tab={tab} go={go} hdr={<TopBar title={mn} sub="Monthly Invoice" onBack={()=>setScreen(null)}/>}>
      <Card p={16} style={{background:`linear-gradient(to bottom,${C.brandXL},${C.surface})`,border:`1px solid ${C.brandL}`,marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
          <div>
            <div style={{fontSize:10,fontWeight:600,color:C.brand,textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Monthly Invoice</div>
            <div style={{fontSize:20,fontWeight:700,color:C.ink}}>{mn}</div>
            <div style={{fontSize:12,color:C.ink3,marginTop:3}}>{mAppts.length} appointments</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:10,color:C.ink4,marginBottom:3}}>Total Billed</div>
            <div style={{fontSize:24,fontWeight:700,color:C.ink}}>₹{total.toLocaleString()}</div>
          </div>
        </div>
        <Divider my={12}/>
        <div className="grid3">
          {[{l:"Collected",v:paid,c:C.greenD,bg:C.greenL,i:"✅"},{l:"At Clinic",v:clinic,c:C.amberD,bg:C.amberL,i:"🏥"},{l:"Pending",v:pending,c:C.redD,bg:C.redL,i:"⏳"}].map(s=>(
            <div key={s.l} style={{background:s.bg,borderRadius:C.r,padding:"10px 8px",textAlign:"center"}}>
              <div style={{fontSize:14,marginBottom:4}}>{s.i}</div>
              <div style={{fontSize:10,fontWeight:600,color:s.c,textTransform:"uppercase",letterSpacing:".3px"}}>{s.l}</div>
              <div style={{fontSize:14,fontWeight:700,color:s.c,marginTop:3}}>₹{s.v.toLocaleString()}</div>
            </div>
          ))}
        </div>
        <div style={{marginTop:12}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
            <span style={{fontSize:11,color:C.ink3}}>Collection Rate</span>
            <span style={{fontSize:11,fontWeight:700,color:C.green}}>{total>0?Math.round(paid/total*100):0}%</span>
          </div>
          <div style={{height:6,background:C.border,borderRadius:C.rFull,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${total>0?Math.round(paid/total*100):0}%`,background:C.green,borderRadius:C.rFull}}/>
          </div>
        </div>
      </Card>
      <SecTitle title="By Therapist"/>
      <Card>
        {DOCS.map(doc=>{
          const da=mAppts.filter(a=>a.therapist===doc);
          const dt=da.reduce((s,a)=>s+(a.amount||0),0);
          const dp=da.filter(a=>a.payStatus==="paid").reduce((s,a)=>s+(a.amount||0),0);
          if(!da.length)return null;
          const col=DCOL[doc]||C.brand;
          return <div key={doc} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:`1px solid ${C.border}`}}>
            <div style={{width:8,height:8,borderRadius:C.rFull,background:col,flexShrink:0}}/>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:600,color:C.ink}}>{doc}</div>
              <div style={{fontSize:11,color:C.ink3,marginTop:1}}>{da.length} patients</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:13,fontWeight:700,color:C.ink}}>₹{dt.toLocaleString()}</div>
              <div style={{fontSize:10,color:C.greenD,marginTop:1}}>₹{dp.toLocaleString()} paid</div>
            </div>
          </div>;
        })}
      </Card>
      <SecTitle title={`Transactions · ${mAppts.length}`}/>
      {mAppts.map(a=><ACard key={a._id} a={a} onMarkPaid={markPaid}/>)}
    </Shell>;
  }

  // ── EARNINGS ──────────────────────────────────────────────────────
  if(tab==="earnings") return <Shell isDesktop={isDesktop} tab={tab} go={go} hdr={<TopBar title="Earnings" sub="Doctor-wise breakdown" icon="📊" right={<RefBtn onClick={load} label={refresh}/>}/>}>
    {/* Filters */}
    <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
      <div style={{flex:1,minWidth:140}}>
        <Sel label="Doctor" value={earningDoc} onChange={setEarningDoc}
          opts={[{v:"all",l:"All Doctors"},...DOCS.map(d=>({v:d,l:d}))]} mb={0}/>
      </div>
      <div style={{flex:1,minWidth:140}}>
        <Sel label="Period" value={earningPeriod} onChange={setEarningPeriod}
          opts={[{v:"today",l:"Today"},{v:"week",l:"Last 7 Days"},{v:"month",l:"This Month"},{v:"all",l:"All Time"}]} mb={0}/>
      </div>
    </div>
    {loading?<Spin/>:<>
      <div className={isDesktop?"grid4":"grid2"} style={{marginBottom:14}}>
        <SC label="Total Billed"  value={`₹${earnings.total.toLocaleString()}`}   sub={`${earnings.count} appointments`} icon="💰" color={C.ink}/>
        <SC label="Collected"     value={`₹${earnings.paid.toLocaleString()}`}     sub="paid" icon="✅" color={C.green}/>
        <SC label="At Clinic"     value={`₹${earnings.clinic.toLocaleString()}`}   sub="to collect" icon="🏥" color={C.amber}/>
        <SC label="Pending"       value={`₹${earnings.pending.toLocaleString()}`}  sub="outstanding" icon="⚠️" color={C.red}/>
      </div>

      {/* Doctor breakdown */}
      <SecTitle title="Doctor-wise Earnings"/>
      {earnings.byDoc.filter(d=>d.count>0).map(d=>{
        const col=DCOL[d.doc]||C.brand;
        const pct=d.total>0?Math.round(d.paid/d.total*100):0;
        return <Card key={d.doc}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
            <div style={{width:38,height:38,borderRadius:C.r,background:`${col}14`,border:`1.5px solid ${col}28`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,color:col,fontWeight:700,flexShrink:0}}>
              {d.doc.split(" ").pop()[0]}
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:600,color:C.ink}}>{d.doc}</div>
              <div style={{fontSize:11,color:C.ink3,marginTop:1}}>{d.count} appointment{d.count!==1?"s":""}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:16,fontWeight:700,color:C.ink}}>₹{d.total.toLocaleString()}</div>
              <div style={{fontSize:11,color:C.greenD,fontWeight:500,marginTop:1}}>₹{d.paid.toLocaleString()} paid</div>
            </div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{fontSize:11,color:C.ink3}}>Collection rate</span>
            <span style={{fontSize:11,fontWeight:600,color:col}}>{pct}%</span>
          </div>
          <div style={{height:5,background:C.border,borderRadius:C.rFull,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${pct}%`,background:col,borderRadius:C.rFull}}/>
          </div>
        </Card>;
      })}
      {earnings.byDoc.every(d=>d.count===0)&&<Card><Empty msg="No data for selected period"/></Card>}

      {/* Monthly trend */}
      <SecTitle title="Monthly Trend"/>
      <Card>
        {earnings.monthly.length===0?<Empty msg="No monthly data"/>:earnings.monthly.map(m=>{
          const[y,mo]=m.key.split("-");
          const mn=new Date(y,mo-1).toLocaleDateString("en-IN",{month:"short",year:"2-digit"});
          const maxTotal=Math.max(...earnings.monthly.map(x=>x.total),1);
          const pct=Math.round(m.total/maxTotal*100);
          return <div key={m.key} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <div style={{minWidth:52,fontSize:11,fontWeight:500,color:C.ink3}}>{mn}</div>
            <div style={{flex:1,height:8,background:C.bg,borderRadius:C.rFull,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${pct}%`,background:C.brand,borderRadius:C.rFull,transition:"width .6s"}}/>
            </div>
            <div style={{minWidth:70,textAlign:"right"}}>
              <div style={{fontSize:12,fontWeight:600,color:C.ink}}>₹{m.total.toLocaleString()}</div>
              <div style={{fontSize:10,color:C.greenD}}>₹{m.paid.toLocaleString()} paid</div>
            </div>
          </div>;
        })}
      </Card>
    </>}
  </Shell>;

  // ── FEEDBACK ──────────────────────────────────────────────────────
  if(tab==="feedback") return <Shell isDesktop={isDesktop} tab={tab} go={go} hdr={<TopBar title="Patient Feedback" sub="Ratings & reviews" icon="⭐" right={<RefBtn onClick={load} label={refresh}/>}/>}>
    {loading?<Spin/>:<>
      {feedbacks.length>0&&(()=>{
        const avg=feedbacks.reduce((s,f)=>s+(f.rating||0),0)/feedbacks.length;
        const dist=[5,4,3,2,1].map(r=>({r,count:feedbacks.filter(f=>f.rating===r).length}));
        return <Card style={{marginBottom:14}}>
          <div style={{display:"flex",gap:16,alignItems:"center"}}>
            <div style={{textAlign:"center",flexShrink:0}}>
              <div style={{fontSize:36,fontWeight:700,color:C.ink,letterSpacing:"-1px"}}>{avg.toFixed(1)}</div>
              <Stars rating={Math.round(avg)} size={16}/>
              <div style={{fontSize:11,color:C.ink4,marginTop:4}}>{feedbacks.length} review{feedbacks.length!==1?"s":""}</div>
            </div>
            <div style={{flex:1}}>
              {dist.map(d=>{
                const pct=feedbacks.length>0?Math.round(d.count/feedbacks.length*100):0;
                return <div key={d.r} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                  <span style={{fontSize:11,color:C.ink3,minWidth:12}}>{d.r}</span>
                  <div style={{flex:1,height:5,background:C.border,borderRadius:C.rFull,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct}%`,background:"#F59E0B",borderRadius:C.rFull}}/>
                  </div>
                  <span style={{fontSize:11,color:C.ink4,minWidth:20}}>{d.count}</span>
                </div>;
              })}
            </div>
          </div>
        </Card>;
      })()}

      <SecTitle title={`Reviews · ${feedbacks.length}`}/>
      {feedbacks.length===0?<Card><Empty msg="No feedback yet. Send feedback requests from patient profiles."/></Card>
        :feedbacks.slice(pFeedback*PER,(pFeedback+1)*PER).map(f=>(
          <Card key={f._id}>
            <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
              <Avatar name={f.patientName||"?"} size={36}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:C.ink}}>{f.patientName}</div>
                    {f.therapist&&<div style={{fontSize:11,color:DCOL[f.therapist]||C.brand,fontWeight:500,marginTop:1}}>{f.therapist}</div>}
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <Stars rating={f.rating||0}/>
                    <div style={{fontSize:10,color:C.ink4,marginTop:3}}>{new Date(f.createdAt).toLocaleDateString("en-IN")}</div>
                  </div>
                </div>
                {f.comment&&<div style={{fontSize:12,color:C.ink3,marginTop:6,lineHeight:1.5,background:C.bg,borderRadius:C.rSm,padding:"7px 10px"}}>{f.comment}</div>}
              </div>
            </div>
          </Card>
        ))
      }
      <Paginator page={pFeedback} total={feedbacks.length} perPage={PER} onChange={setPFeedback}/>
    </>}
  </Shell>;

  return null;
}
