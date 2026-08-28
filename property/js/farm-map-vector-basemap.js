(()=>{
  'use strict';
  if(!window.L||window.__watchdogFarmVectorBasemap)return;
  window.__watchdogFarmVectorBasemap=true;

  const OSM_TEMPLATE='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const OPENFREEMAP_STYLE='https://tiles.openfreemap.org/styles/liberty';
  const MAPLIBRE_JS='https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js';
  const MAPLIBRE_CSS='https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css';
  const LEAFLET_BINDING='https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js';
  const VECTOR_ATTRIBUTION='<a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> · Data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>';
  const originalTileLayer=L.tileLayer.bind(L);
  let dependenciesPromise=null;

  function webglAvailable(){
    try{
      const canvas=document.createElement('canvas');
      return !!(canvas.getContext('webgl2')||canvas.getContext('webgl')||canvas.getContext('experimental-webgl'));
    }catch(_error){return false;}
  }

  function ensureCss(){
    if(document.querySelector('link[data-watchdog-maplibre]'))return;
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href=MAPLIBRE_CSS;
    link.dataset.watchdogMaplibre='1';
    document.head.appendChild(link);
  }

  function loadScript(src,marker){
    return new Promise((resolve,reject)=>{
      if(marker&&window[marker]){resolve();return;}
      const existing=document.querySelector(`script[src="${src}"]`);
      if(existing){
        if(existing.dataset.watchdogLoaded==='1'){resolve();return;}
        existing.addEventListener('load',resolve,{once:true});
        existing.addEventListener('error',reject,{once:true});
        return;
      }
      const script=document.createElement('script');
      script.src=src;
      script.async=true;
      script.dataset.watchdogMaplibre='1';
      script.onload=()=>{script.dataset.watchdogLoaded='1';resolve();};
      script.onerror=()=>reject(new Error(`Could not load ${src}`));
      document.head.appendChild(script);
    });
  }

  function loadDependencies(){
    if(dependenciesPromise)return dependenciesPromise;
    dependenciesPromise=(async()=>{
      if(!webglAvailable())throw new Error('WebGL unavailable');
      ensureCss();
      if(!window.maplibregl)await loadScript(MAPLIBRE_JS,'maplibregl');
      if(typeof L.maplibreGL!=='function')await loadScript(LEAFLET_BINDING);
      if(!window.maplibregl||typeof L.maplibreGL!=='function')throw new Error('MapLibre binding unavailable');
      return true;
    })();
    return dependenciesPromise;
  }

  const VectorBasemap=L.Layer.extend({
    initialize(options){
      this._options=Object.assign({maxZoom:19,attribution:'© OpenStreetMap'},options||{});
      this._fallback=originalTileLayer(OSM_TEMPLATE,this._options);
      this._vector=null;
      this._mapRef=null;
      this._vectorAttribution=false;
      this._removed=false;
    },
    onAdd(map){
      this._removed=false;
      this._mapRef=map;
      this._fallback.addTo(map);
      document.documentElement.dataset.farmBasemap='osm-loading';
      loadDependencies().then(()=>this._upgrade()).catch(error=>{
        document.documentElement.dataset.farmBasemap='osm-fallback';
        console.warn('[watchdog] Vector basemap unavailable; keeping raster fallback.',error?.message||error);
      });
    },
    onRemove(map){
      this._removed=true;
      if(this._vector&&map.hasLayer(this._vector))map.removeLayer(this._vector);
      if(this._fallback&&map.hasLayer(this._fallback))map.removeLayer(this._fallback);
      if(this._vectorAttribution&&map.attributionControl){map.attributionControl.removeAttribution(VECTOR_ATTRIBUTION);this._vectorAttribution=false;}
      this._mapRef=null;
    },
    _upgrade(){
      const map=this._mapRef;
      if(!map||this._removed||this._vector||typeof L.maplibreGL!=='function')return;
      let settled=false;
      const vector=L.maplibreGL({style:OPENFREEMAP_STYLE,interactive:false,attributionControl:false});
      this._vector=vector;
      vector.addTo(map);
      const gl=typeof vector.getMaplibreMap==='function'?vector.getMaplibreMap():null;
      if(!gl){this._failVector('MapLibre map unavailable');return;}
      const timeout=setTimeout(()=>{if(!settled)this._failVector('OpenFreeMap style timed out');},8000);
      gl.once('load',()=>{
        if(settled||this._removed)return;
        settled=true;clearTimeout(timeout);
        if(this._fallback&&map.hasLayer(this._fallback))map.removeLayer(this._fallback);
        if(map.attributionControl&&!this._vectorAttribution){map.attributionControl.addAttribution(VECTOR_ATTRIBUTION);this._vectorAttribution=true;}
        document.documentElement.dataset.farmBasemap='openfreemap-vector';
      });
      gl.once('error',event=>{
        if(settled)return;
        settled=true;clearTimeout(timeout);
        this._failVector(event?.error?.message||'OpenFreeMap style failed');
      });
    },
    _failVector(reason){
      const map=this._mapRef;
      if(map&&this._vector&&map.hasLayer(this._vector))map.removeLayer(this._vector);
      this._vector=null;
      document.documentElement.dataset.farmBasemap='osm-fallback';
      console.warn('[watchdog] OpenFreeMap pilot fell back to OpenStreetMap raster.',reason);
    }
  });

  L.tileLayer=function(url,options){
    if(String(url)===OSM_TEMPLATE)return new VectorBasemap(options);
    return originalTileLayer(url,options);
  };
})();
