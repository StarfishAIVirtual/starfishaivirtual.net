/* Starfish site analytics (Google Analytics 4), shared by every page.

   Consent rules:
   - A browser sending Global Privacy Control is never tracked.
   - A visitor's saved choice (Accept / Decline) is always respected.
   - With no saved choice, visitors whose time zone is in Europe see a banner
     and are only tracked after they accept; everyone else is tracked and can
     turn it off from "Cookie settings" in the footer.
   Google Signals and ad personalization are switched off, so analytics data
   is never used for advertising.

   Pages send events with starfishTrack(name, params); links can instead carry
   data-track="event_name" (and optional data-label). */
(function(){
  var ID='G-7PHFWL1CXN', KEY='starfish-analytics-consent';
  var loaded=false, scriptAdded=false, stoppedSince=false, gaBlocked=false, gaLoaded=false, onLoaded=[], banner=null;

  window.dataLayer=window.dataLayer||[];
  function gtag(){window.dataLayer.push(arguments);}
  window.gtag=gtag;

  function stored(){try{return localStorage.getItem(KEY);}catch(e){return null;}}
  function store(v){try{localStorage.setItem(KEY,v);}catch(e){}}
  /* EU/EEA/UK time zones, including those outside the Europe/ prefix
     (Ceuta and Melilla, Cyprus, Svalbard and the EU's outermost regions). */
  var EU_EXTRA=['Africa/Ceuta','Asia/Nicosia','Asia/Famagusta','Arctic/Longyearbyen','Indian/Reunion','Indian/Mayotte',
    'America/Guadeloupe','America/Martinique','America/Cayenne','America/St_Barthelemy','America/Marigot'];
  /* Europe/ zones outside the EU/EEA/UK (Russia, Belarus, Türkiye), which get no banner. */
  var NOT_EU=/^Europe\/(Moscow|Kaliningrad|Samara|Saratov|Ulyanovsk|Astrakhan|Volgograd|Kirov|Simferopol|Minsk|Istanbul)$/;
  function inEurope(){
    try{
      var tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'';
      /* A generic zone (UTC, Etc/...) says nothing about location, so ask to be safe. */
      if(!tz||/^(UTC|GMT|Etc\/)/.test(tz))return true;
      if(NOT_EU.test(tz))return false;
      return /^(Europe|Atlantic\/(Canary|Madeira|Azores|Faroe|Reykjavik))/.test(tz)||EU_EXTRA.indexOf(tz)!==-1;
    }catch(e){return true;}
  }
  var gpc=navigator.globalPrivacyControl===true;

  function load(){
    if(loaded||gpc)return;
    loaded=true;
    window['ga-disable-'+ID]=false;
    var cfg={allow_google_signals:false,allow_ad_personalization_signals:false};
    /* Google's script and the page view are set up once per page. After Decline then Accept,
       config runs again to restore the cookies Decline removed, without a second page view. */
    if(scriptAdded){
      if(stoppedSince){stoppedSince=false;cfg.send_page_view=false;gtag('config',ID,cfg);}
      /* If Google's script failed earlier (blocker or network), Accept tries it again. */
      if(gaBlocked)addScript();
      return;
    }
    scriptAdded=true;
    gtag('js',new Date());
    gtag('config',ID,cfg);
    addScript();
  }
  /* Google's script processes everything already in dataLayer when it loads, so events never
     need to wait here. If it fails (an ad blocker or a network problem), later events report
     "not sent" and the banner says analytics couldn't load. */
  function addScript(){
    gaBlocked=false;
    var s=document.createElement('script');
    s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id='+ID;
    s.onload=function(){gaLoaded=true;var cbs=onLoaded;onLoaded=[];cbs.forEach(function(cb){cb();});};
    s.onerror=function(){gaBlocked=true;onLoaded=[];showState();};
    document.head.appendChild(s);
  }
  function stop(){
    window['ga-disable-'+ID]=true;
    if(scriptAdded)stoppedSince=true;
    loaded=false;
    /* Remove other analytics-only data this site stores: any localStorage key starting with
       "starfish-analytics-" (except the consent choice itself), plus the older Diagnostic key. */
    try{
      for(var i=localStorage.length-1;i>=0;i--){
        var k=localStorage.key(i);
        if(k&&k!==KEY&&k.indexOf('starfish-analytics-')===0)localStorage.removeItem(k);
      }
      localStorage.removeItem('starfish-diagnostic-sent');
    }catch(e){}
    /* Remove Google Analytics cookies already set on this site. */
    document.cookie.split(';').forEach(function(c){
      var name=c.split('=')[0].trim();
      if(/^_ga/.test(name)){
        /* Try the host and every parent domain; the browser ignores ones it can't use (such as .co.uk). */
        var parts=location.hostname.split('.'), domains=[''];
        for(var i=0;i<parts.length-1;i++)domains.push(parts.slice(i).join('.'));
        domains.forEach(function(d){
          document.cookie=name+'=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'+(d?'; domain='+d:'');
        });
      }
    });
  }

  /* Whether analytics is on right now (consent given and Google's script not blocked). */
  window.starfishAnalyticsOn=function(){return loaded&&!gaBlocked;};

  /* Send an event when analytics is on, the standard way: into Google's queue, which its script
     sends once loaded. Returns true if the event was queued, false if analytics is off or Google's
     script is known to be blocked. */
  window.starfishTrack=function(name,params){
    if(!window.starfishAnalyticsOn())return false;
    gtag('event',name,params||{});
    return true;
  };

  /* Send an event at most once per visit, shared by any page that needs it (the Diagnostic uses
     it). A visit ends after 30 minutes without the action, like a Google Analytics session: a
     repeat inside the visit isn't sent again but restarts the 30 minutes. The note is stored as
     "starfish-analytics-<key>-sent" (Decline removes it), is only written or extended while
     analytics is on, and is only recorded once Google's script has actually loaded, so an
     event lost to a blocker is never recorded as counted. */
  var VISIT_MS=30*60*1000, LEGACY={diagnostic:'starfish-diagnostic-sent'};
  window.starfishTrackOncePerVisit=function(key,name,params){
    var k='starfish-analytics-'+key+'-sent';
    function last(){try{return Number(localStorage.getItem(k)||(LEGACY[key]&&localStorage.getItem(LEGACY[key]))||0);}catch(e){return 0;}}
    function mark(){
      if(!window.starfishAnalyticsOn())return;
      try{localStorage.setItem(k,String(Date.now()));if(LEGACY[key])localStorage.removeItem(LEGACY[key]);}catch(e){}
    }
    var t=last();
    if(t&&Date.now()-t<VISIT_MS){mark();return false;}
    if(!window.starfishTrack(name,params))return false;
    if(gaLoaded)mark();else onLoaded.push(mark);
    return true;
  };

  function showBanner(){
    if(banner){showState();banner.hidden=false;return;}
    var css=document.createElement('style');
    css.textContent='.sf-consent{position:fixed;left:12px;right:12px;bottom:12px;z-index:50;max-width:720px;margin:0 auto;'+
      'background:#0C1B33;color:#eef2f8;border:1px solid #D4AF37;border-radius:12px;padding:14px 16px;'+
      'box-shadow:0 10px 30px rgba(0,0,0,.4);font:14px/1.5 Inter,system-ui,sans-serif;display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center}'+
      '.sf-consent[hidden]{display:none}.sf-consent p{flex:1 1 260px;margin:0}.sf-consent a{color:#e9d58c}'+
      '.sf-consent button{font:600 14px Inter,system-ui,sans-serif;border-radius:999px;padding:8px 16px;cursor:pointer;width:auto}'+
      '.sf-consent .yes{background:#D4AF37;color:#0C1B33;border:0}.sf-consent .no{background:none;color:#D4AF37;border:1px solid #D4AF37}';
    document.head.appendChild(css);
    banner=document.createElement('div');
    banner.className='sf-consent';banner.setAttribute('role','region');banner.setAttribute('aria-label','Cookie choice');
    banner.innerHTML='<p>We use Google Analytics cookies to see how this site is used. Nothing is used for advertising. '+
      '<b class="sf-state"></b> <a href="privacy.html">Privacy</a></p><button type="button" class="no">Decline</button><button type="button" class="yes">Accept</button>';
    banner.querySelector('.yes').onclick=function(){store('granted');banner.hidden=true;load();};
    banner.querySelector('.no').onclick=function(){store('denied');banner.hidden=true;stop();};
    document.body.appendChild(banner);
    showState();
  }
  /* Tell the visitor what their current setting is each time the banner opens. */
  function showState(){
    var el=banner&&banner.querySelector('.sf-state');
    if(!el)return;
    el.textContent=loaded&&gaBlocked?'Analytics couldn\'t load (blocked by your browser or a network problem), so nothing is collected.':
      loaded?'Analytics is currently on.':(stored()==='denied'?'Analytics is currently off.':'Analytics is off until you choose.');
  }

  var choice=stored();
  /* Global Privacy Control: never track, and clear any analytics cookies set earlier. */
  if(gpc)stop();
  else{
    if(choice==='granted')load();
    else if(choice!=='denied'&&!inEurope())load();
  }

  document.addEventListener('DOMContentLoaded',function(){
    if(!gpc&&choice===null&&inEurope())showBanner();
    /* The footer link is hidden in the HTML, so it only appears when this file has loaded. */
    document.querySelectorAll('[data-cookie-settings-wrap]').forEach(function(w){w.hidden=false;});
    document.querySelectorAll('[data-cookie-settings]').forEach(function(a){
      if(gpc){a.textContent='Analytics off (Global Privacy Control)';a.removeAttribute('href');return;}
      a.addEventListener('click',function(e){e.preventDefault();showBanner();});
    });
  });

  document.addEventListener('click',function(e){
    var a=e.target.closest&&e.target.closest('[data-track]');
    if(a)window.starfishTrack(a.getAttribute('data-track'),
      {link_label:a.getAttribute('data-label')||a.textContent.trim(),page:location.pathname});
  });
})();
