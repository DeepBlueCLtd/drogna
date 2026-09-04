import{r as a,j as i,u as _t,o as St,m as Ze,n as Ke,d as Q,g as Le,v as Be,a as Rt,b as Mt,p as $t,c as Et,i as At,e as He,f as Ft,P as Ye,H as Ot,h as Tt,D as Xe}from"./main-CyaTBp6N.js";import{a as Nt,c as Wt,o as Ut,v as It,O as Dt}from"./cube-CdEWECjZ.js";import{C as zt,L as qt,M as Gt,m as Vt,c as ae,z as de,a as _e,G as ot,V as Zt,W as Kt,b as Bt,d as Ht,p as Yt,e as Xt,U as Je,f as Jt,g as Qt,P as F,S as Qe,h as q,D as ei,i as ti}from"./solid-polygon-layer-px866Tgh.js";import{P as he}from"./polygon-layer-D9wkEzsh.js";import"./modulepreload-polyfill-B5Qt9EMX.js";const ii=`

@must_use
fn deckgl_premultiplied_alpha(fragColor: vec4<f32>) -> vec4<f32> {
    return vec4(fragColor.rgb * fragColor.a, fragColor.a); 
};
`,si={name:"color",dependencies:[],source:ii,getUniforms:l=>({})},Se=Math.PI/180,oi=180/Math.PI;function et(l,t=0){const o=Math.min(180,l)*Se;return ot*2*Math.sin(o/2)*Math.pow(2,t)}function tt(l,t=0){const o=l/Math.pow(2,t);return Math.asin(Math.min(1,o/ot/2))*2*oi}class ni extends Gt{constructor(t){const{startPanPos:o,...n}=t;n.normalize=!1,super(n),o!==void 0&&(this._state.startPanPos=o)}panStart({pos:t}){const{latitude:o,longitude:n,zoom:r}=this.getViewportProps();return this._getUpdatedState({startPanLngLat:[n,o],startPanPos:t,startZoom:r})}pan({pos:t,startPos:o}){const n=this.getState(),r=n.startPanLngLat||this._unproject(o);if(!r)return this;const f=n.startZoom??this.getViewportProps().zoom,v=n.startPanPos||o,C=[r[0],r[1],f],k=this.makeViewport(this.getViewportProps()).panByPosition(C,t,v);return this._getUpdatedState(k)}panEnd(){return this._getUpdatedState({startPanLngLat:null,startPanPos:null,startZoom:null})}zoom({scale:t}){const n=(this.getState().startZoom||this.getViewportProps().zoom)+Math.log2(t);return this._getUpdatedState({zoom:n})}applyConstraints(t){const{longitude:o,latitude:n,maxBounds:r}=t;if(t.zoom=this._constrainZoom(t.zoom,t),(o<-180||o>180)&&(t.longitude=Vt(o+180,360)-180),t.latitude=ae(n,-_e,_e),r&&(t.longitude=ae(t.longitude,r[0][0],r[1][0]),t.latitude=ae(t.latitude,r[0][1],r[1][1])),r){const f=t.zoom-de(n),v=r[1][0]-r[0][0],C=r[1][1]-r[0][1];if(C>0&&C<_e*2){const h=Math.min(tt(t.height,f),C)/2;t.latitude=ae(t.latitude,r[0][1]+h,r[1][1]-h)}if(v>0&&v<360){const h=Math.min(tt(t.width/Math.cos(t.latitude*Se),f),v)/2;t.longitude=ae(t.longitude,r[0][0]+h,r[1][0]-h)}}return t.latitude!==n&&(t.zoom+=de(t.latitude)-de(n)),t}_constrainZoom(t,o){o||(o=this.getViewportProps());const{latitude:n,maxZoom:r,maxBounds:f}=o;let{minZoom:v}=o;const C=de(0),h=de(n)-C;if(f!==null&&o.width>0&&o.height>0){const y=f[0][1],I=f[1][1],M=Math.sign(y)===Math.sign(I)?Math.min(Math.abs(y),Math.abs(I)):0,w=et(f[1][0]-f[0][0])*Math.cos(M*Se),S=et(f[1][1]-f[0][1]);w>0&&(v=Math.max(v,Math.log2(o.width/w)+C)),S>0&&(v=Math.max(v,Math.log2(o.height/S)+C)),v>r&&(v=r)}return ae(t,v+h,r+h)}}class ai extends zt{constructor(){super(...arguments),this.ControllerState=ni,this.transition={transitionDuration:300,transitionInterpolator:new qt(["longitude","latitude","zoom"])},this.dragMode="pan"}setProps(t){super.setProps(t),this.dragRotate=!1,this.touchRotate=!1}}const ri={cullMode:"back"};class nt extends Zt{constructor(t={}){super({...t,parameters:{...ri,...t.parameters}})}getViewportType(t){return t.zoom>12?Kt:Bt}get ControllerType(){return ai}}nt.displayName="GlobeView";const it=`layout(std140) uniform scatterplotUniforms {
  float radiusScale;
  float radiusMinPixels;
  float radiusMaxPixels;
  float lineWidthScale;
  float lineWidthMinPixels;
  float lineWidthMaxPixels;
  float stroked;
  float filled;
  bool antialiasing;
  bool billboard;
  highp int radiusUnits;
  highp int lineWidthUnits;
} scatterplot;
`,li={name:"scatterplot",vs:it,fs:it,source:"",uniformTypes:{radiusScale:"f32",radiusMinPixels:"f32",radiusMaxPixels:"f32",lineWidthScale:"f32",lineWidthMinPixels:"f32",lineWidthMaxPixels:"f32",stroked:"f32",filled:"f32",antialiasing:"f32",billboard:"f32",radiusUnits:"i32",lineWidthUnits:"i32"}},di=`#version 300 es
#define SHADER_NAME scatterplot-layer-vertex-shader
in vec3 positions;
in vec3 instancePositions;
in vec3 instancePositions64Low;
in float instanceRadius;
in float instanceLineWidths;
in vec4 instanceFillColors;
in vec4 instanceLineColors;
in vec3 instancePickingColors;
in vec2 instancePixelOffset;
out vec4 vFillColor;
out vec4 vLineColor;
out vec2 unitPosition;
out float innerUnitRadius;
out float outerRadiusPixels;
void main(void) {
geometry.worldPosition = instancePositions;
outerRadiusPixels = clamp(
project_size_to_pixel(scatterplot.radiusScale * instanceRadius, scatterplot.radiusUnits),
scatterplot.radiusMinPixels, scatterplot.radiusMaxPixels
);
float lineWidthPixels = clamp(
project_size_to_pixel(scatterplot.lineWidthScale * instanceLineWidths, scatterplot.lineWidthUnits),
scatterplot.lineWidthMinPixels, scatterplot.lineWidthMaxPixels
);
outerRadiusPixels += scatterplot.stroked * lineWidthPixels / 2.0;
float edgePadding = scatterplot.antialiasing ? (outerRadiusPixels + SMOOTH_EDGE_RADIUS) / outerRadiusPixels : 1.0;
unitPosition = edgePadding * positions.xy;
geometry.uv = unitPosition;
geometry.pickingColor = instancePickingColors;
innerUnitRadius = 1.0 - scatterplot.stroked * lineWidthPixels / outerRadiusPixels;
if (scatterplot.billboard) {
gl_Position = project_position_to_clipspace(instancePositions, instancePositions64Low, vec3(0.0), geometry.position);
DECKGL_FILTER_GL_POSITION(gl_Position, geometry);
vec3 offset = edgePadding * positions * outerRadiusPixels;
offset.xy += instancePixelOffset;
DECKGL_FILTER_SIZE(offset, geometry);
gl_Position.xy += project_pixel_size_to_clipspace(offset.xy);
} else {
vec3 offset = edgePadding * positions * project_pixel_size(outerRadiusPixels);
offset.xy += project_pixel_size(instancePixelOffset);
DECKGL_FILTER_SIZE(offset, geometry);
gl_Position = project_position_to_clipspace(instancePositions, instancePositions64Low, offset, geometry.position);
DECKGL_FILTER_GL_POSITION(gl_Position, geometry);
}
vFillColor = vec4(instanceFillColors.rgb, instanceFillColors.a * layer.opacity);
DECKGL_FILTER_COLOR(vFillColor, geometry);
vLineColor = vec4(instanceLineColors.rgb, instanceLineColors.a * layer.opacity);
DECKGL_FILTER_COLOR(vLineColor, geometry);
}
`,ci=`#version 300 es
#define SHADER_NAME scatterplot-layer-fragment-shader
precision highp float;
in vec4 vFillColor;
in vec4 vLineColor;
in vec2 unitPosition;
in float innerUnitRadius;
in float outerRadiusPixels;
out vec4 fragColor;
void main(void) {
geometry.uv = unitPosition;
float distToCenter = length(unitPosition) * outerRadiusPixels;
float inCircle = scatterplot.antialiasing ?
smoothedge(distToCenter, outerRadiusPixels) :
step(distToCenter, outerRadiusPixels);
if (inCircle == 0.0) {
discard;
}
if (scatterplot.stroked > 0.5) {
float isLine = scatterplot.antialiasing ?
smoothedge(innerUnitRadius * outerRadiusPixels, distToCenter) :
step(innerUnitRadius * outerRadiusPixels, distToCenter);
if (scatterplot.filled > 0.5) {
fragColor = mix(vFillColor, vLineColor, isLine);
} else {
if (isLine == 0.0) {
discard;
}
fragColor = vec4(vLineColor.rgb, vLineColor.a * isLine);
}
} else if (scatterplot.filled < 0.5) {
discard;
} else {
fragColor = vFillColor;
}
fragColor.a *= inCircle;
DECKGL_FILTER_COLOR(fragColor, geometry);
}
`,ui=`// Main shaders

struct ScatterplotUniforms {
  radiusScale: f32,
  radiusMinPixels: f32,
  radiusMaxPixels: f32,
  lineWidthScale: f32,
  lineWidthMinPixels: f32,
  lineWidthMaxPixels: f32,
  stroked: f32,
  filled: i32,
  antialiasing: i32,
  billboard: i32,
  radiusUnits: i32,
  lineWidthUnits: i32,
};

struct ConstantAttributeUniforms {
 instancePositions: vec3<f32>,
 instancePositions64Low: vec3<f32>,
 instanceRadius: f32,
 instanceLineWidths: f32,
 instanceFillColors: vec4<f32>,
 instanceLineColors: vec4<f32>,
 instancePickingColors: vec3<f32>,
 instancePixelOffset: vec2<f32>,

 instancePositionsConstant: i32,
 instancePositions64LowConstant: i32,
 instanceRadiusConstant: i32,
 instanceLineWidthsConstant: i32,
 instanceFillColorsConstant: i32,
 instanceLineColorsConstant: i32,
 instancePickingColorsConstant: i32,
 instancePixelOffsetConstant: i32
};

@group(0) @binding(0) var<uniform> scatterplot: ScatterplotUniforms;

struct ConstantAttributes {
  instancePositions: vec3<f32>,
  instancePositions64Low: vec3<f32>,
  instanceRadius: f32,
  instanceLineWidths: f32,
  instanceFillColors: vec4<f32>,
  instanceLineColors: vec4<f32>,
  instancePickingColors: vec3<f32>,
  instancePixelOffset: vec2<f32>
};

const constants = ConstantAttributes(
  vec3<f32>(0.0),
  vec3<f32>(0.0),
  0.0,
  0.0,
  vec4<f32>(0.0, 0.0, 0.0, 1.0),
  vec4<f32>(0.0, 0.0, 0.0, 1.0),
  vec3<f32>(0.0),
  vec2<f32>(0.0)
);

struct Attributes {
  @builtin(instance_index) instanceIndex : u32,
  @builtin(vertex_index) vertexIndex : u32,
  @location(0) positions: vec3<f32>,
  @location(1) instancePositions: vec3<f32>,
  @location(2) instancePositions64Low: vec3<f32>,
  @location(3) instanceRadius: f32,
  @location(4) instanceLineWidths: f32,
  @location(5) instanceFillColors: vec4<f32>,
  @location(6) instanceLineColors: vec4<f32>,
  @location(7) instancePickingColors: vec3<f32>,
  @location(8) instancePixelOffset: vec2<f32>
};

struct Varyings {
  @builtin(position) position: vec4<f32>,
  @location(0) vFillColor: vec4<f32>,
  @location(1) vLineColor: vec4<f32>,
  @location(2) unitPosition: vec2<f32>,
  @location(3) innerUnitRadius: f32,
  @location(4) outerRadiusPixels: f32,
  @location(5) pickingColor: vec3<f32>,
};

@vertex
fn vertexMain(attributes: Attributes) -> Varyings {
  var varyings: Varyings;

  // Draw an inline geometry constant array clip space triangle to verify that rendering works.
  // var positions = array<vec2<f32>, 3>(vec2(0.0, 0.5), vec2(-0.5, -0.5), vec2(0.5, -0.5));
  // if (attributes.instanceIndex == 0) {
  //   varyings.position = vec4<f32>(positions[attributes.vertexIndex], 0.0, 1.0);
  //   return varyings;
  // }

  geometry.worldPosition = attributes.instancePositions;

  // Multiply out radius and clamp to limits
  varyings.outerRadiusPixels = clamp(
    project_unit_size_to_pixel(scatterplot.radiusScale * attributes.instanceRadius, scatterplot.radiusUnits),
    scatterplot.radiusMinPixels, scatterplot.radiusMaxPixels
  );

  // Multiply out line width and clamp to limits
  let lineWidthPixels = clamp(
    project_unit_size_to_pixel(scatterplot.lineWidthScale * attributes.instanceLineWidths, scatterplot.lineWidthUnits),
    scatterplot.lineWidthMinPixels, scatterplot.lineWidthMaxPixels
  );

  // outer radius needs to offset by half stroke width
  varyings.outerRadiusPixels += scatterplot.stroked * lineWidthPixels / 2.0;
  // Expand geometry to accommodate edge smoothing
  let edgePadding = select(
    (varyings.outerRadiusPixels + SMOOTH_EDGE_RADIUS) / varyings.outerRadiusPixels,
    1.0,
    scatterplot.antialiasing != 0
  );

  // position on the containing square in [-1, 1] space
  varyings.unitPosition = edgePadding * attributes.positions.xy;
  geometry.uv = varyings.unitPosition;
  geometry.pickingColor = attributes.instancePickingColors;

  varyings.innerUnitRadius = 1.0 - scatterplot.stroked * lineWidthPixels / varyings.outerRadiusPixels;

  if (scatterplot.billboard != 0) {
    varyings.position = project_position_to_clipspace(attributes.instancePositions, attributes.instancePositions64Low, vec3<f32>(0.0)); // TODO , geometry.position);
    // DECKGL_FILTER_GL_POSITION(varyings.position, geometry);
    var offset = edgePadding * attributes.positions * varyings.outerRadiusPixels;
    offset = vec3<f32>(offset.xy + attributes.instancePixelOffset, offset.z);
    // DECKGL_FILTER_SIZE(offset, geometry);
    let clipPixels = project_pixel_size_to_clipspace(offset.xy);
    varyings.position = vec4<f32>(varyings.position.x + clipPixels.x, varyings.position.y + clipPixels.y, varyings.position.z, varyings.position.w);
  } else {
    var offset = edgePadding * attributes.positions * project_pixel_size_float(varyings.outerRadiusPixels);
    offset = vec3<f32>(offset.xy + project_pixel_size_vec2(attributes.instancePixelOffset), offset.z);
    // DECKGL_FILTER_SIZE(offset, geometry);
    varyings.position = project_position_to_clipspace(attributes.instancePositions, attributes.instancePositions64Low, offset); // TODO , geometry.position);
    // DECKGL_FILTER_GL_POSITION(varyings.position, geometry);
  }

  // Apply opacity to instance color, or return instance picking color
  varyings.vFillColor = vec4<f32>(attributes.instanceFillColors.rgb, attributes.instanceFillColors.a * layer.opacity);
  // DECKGL_FILTER_COLOR(varyings.vFillColor, geometry);
  varyings.vLineColor = vec4<f32>(attributes.instanceLineColors.rgb, attributes.instanceLineColors.a * layer.opacity);
  // DECKGL_FILTER_COLOR(varyings.vLineColor, geometry);
  varyings.pickingColor = attributes.instancePickingColors;

  return varyings;
}

@fragment
fn fragmentMain(varyings: Varyings) -> @location(0) vec4<f32> {
  // var geometry: Geometry;
  // geometry.uv = unitPosition;

  let distToCenter = length(varyings.unitPosition) * varyings.outerRadiusPixels;
  let inCircle = select(
    smoothedge(distToCenter, varyings.outerRadiusPixels),
    step(distToCenter, varyings.outerRadiusPixels),
    scatterplot.antialiasing != 0
  );

  if (inCircle == 0.0) {
    discard;
  }

  var fragColor: vec4<f32>;

  if (scatterplot.stroked != 0) {
    let isLine = select(
      smoothedge(varyings.innerUnitRadius * varyings.outerRadiusPixels, distToCenter),
      step(varyings.innerUnitRadius * varyings.outerRadiusPixels, distToCenter),
      scatterplot.antialiasing != 0
    );

    if (scatterplot.filled != 0) {
      fragColor = mix(varyings.vFillColor, varyings.vLineColor, isLine);
    } else {
      if (isLine == 0.0) {
        discard;
      }
      fragColor = vec4<f32>(varyings.vLineColor.rgb, varyings.vLineColor.a * isLine);
    }
  } else if (scatterplot.filled == 0) {
    discard;
  } else {
    fragColor = varyings.vFillColor;
  }

  fragColor.a *= inCircle;

  if (picking.isActive > 0.5) {
    if (!picking_isColorValid(varyings.pickingColor)) {
      discard;
    }
    return vec4<f32>(varyings.pickingColor, 1.0);
  }

  if (picking.isHighlightActive > 0.5) {
    let highlightedObjectColor = picking_normalizeColor(picking.highlightedObjectColor);
    if (picking_isColorZero(abs(varyings.pickingColor - highlightedObjectColor))) {
      let highLightAlpha = picking.highlightColor.a;
      let blendedAlpha = highLightAlpha + fragColor.a * (1.0 - highLightAlpha);
      if (blendedAlpha > 0.0) {
        let highLightRatio = highLightAlpha / blendedAlpha;
        fragColor = vec4<f32>(
          mix(fragColor.rgb, picking.highlightColor.rgb, highLightRatio),
          blendedAlpha
        );
      } else {
        fragColor = vec4<f32>(fragColor.rgb, 0.0);
      }
    }
  }

  // Apply premultiplied alpha as required by transparent canvas
  fragColor = deckgl_premultiplied_alpha(fragColor);

  return fragColor;
  // return vec4<f32>(0, 0, 1, 1);
}
`,st=[0,0,0,255],pi={radiusUnits:"meters",radiusScale:{type:"number",min:0,value:1},radiusMinPixels:{type:"number",min:0,value:0},radiusMaxPixels:{type:"number",min:0,value:Number.MAX_SAFE_INTEGER},lineWidthUnits:"meters",lineWidthScale:{type:"number",min:0,value:1},lineWidthMinPixels:{type:"number",min:0,value:0},lineWidthMaxPixels:{type:"number",min:0,value:Number.MAX_SAFE_INTEGER},stroked:!1,filled:!0,billboard:!1,antialiasing:!0,getPosition:{type:"accessor",value:l=>l.position},getRadius:{type:"accessor",value:1},getFillColor:{type:"accessor",value:st},getLineColor:{type:"accessor",value:st},getLineWidth:{type:"accessor",value:1},getPixelOffset:{type:"accessor",value:[0,0]},strokeWidth:{deprecatedFor:"getLineWidth"},outline:{deprecatedFor:"stroked"},getColor:{deprecatedFor:["getFillColor","getLineColor"]}};class U extends Ht{getShaders(){return super.getShaders({vs:di,fs:ci,source:ui,modules:[Yt,si,Xt,li]})}initializeState(){this.getAttributeManager().addInstanced({instancePositions:{size:3,type:"float64",fp64:this.use64bitPositions(),transition:!0,accessor:"getPosition"},instanceRadius:{size:1,transition:!0,accessor:"getRadius",defaultValue:1},instanceFillColors:{size:this.props.colorFormat.length,transition:!0,type:"unorm8",accessor:"getFillColor",defaultValue:[0,0,0,255]},instanceLineColors:{size:this.props.colorFormat.length,transition:!0,type:"unorm8",accessor:"getLineColor",defaultValue:[0,0,0,255]},instanceLineWidths:{size:1,transition:!0,accessor:"getLineWidth",defaultValue:1},instancePixelOffset:{size:2,transition:!0,accessor:"getPixelOffset"}})}updateState(t){var o;super.updateState(t),t.changeFlags.extensionsChanged&&((o=this.state.model)==null||o.destroy(),this.state.model=this._getModel(),this.getAttributeManager().invalidateAll())}draw({uniforms:t}){const{radiusUnits:o,radiusScale:n,radiusMinPixels:r,radiusMaxPixels:f,stroked:v,filled:C,billboard:h,antialiasing:k,lineWidthUnits:y,lineWidthScale:I,lineWidthMinPixels:M,lineWidthMaxPixels:w}=this.props,S={stroked:v,filled:C,billboard:h,antialiasing:k,radiusUnits:Je[o],radiusScale:n,radiusMinPixels:r,radiusMaxPixels:f,lineWidthUnits:Je[y],lineWidthScale:I,lineWidthMinPixels:M,lineWidthMaxPixels:w},ee=this.state.model;ee.shaderInputs.setProps({scatterplot:S}),ee.draw(this.context.renderPass)}_getModel(){const t=[-1,-1,0,1,-1,0,-1,1,0,1,1,0];return new Jt(this.context.device,{...this.getShaders(),id:this.props.id,bufferLayout:this.getAttributeManager().getBufferLayouts(),geometry:new Qt({topology:"triangle-strip",attributes:{positions:{size:3,value:new Float32Array(t)}}}),isInstanced:!0})}}U.defaultProps=pi;U.layerName="ScatterplotLayer";function hi(l,t){if(l.isConnected)return t(),()=>{};const o=new MutationObserver(()=>{l.isConnected&&(o.disconnect(),t())});return o.observe(l.ownerDocument.body,{childList:!0,subtree:!0}),()=>o.disconnect()}function gi(l,t){return{collections:[...t].sort(),queryTypes:[...l.edr.query_types],parameters:[...l.edr.parameters]}}function fi(l,t){if(!t.collection)return{ok:!1,missing:"choose a collection"};if(!t.queryType)return{ok:!1,missing:"choose a query type"};if(t.queryType==="trajectory")return{ok:!1,missing:"the composer does not guide trajectory queries: a trajectory carries per-vertex depth and time, which this sequence does not collect — compose it by hand against the stated subset"};if(t.longitude===void 0||t.latitude===void 0)return{ok:!1,missing:"set a position (click the map, or type lon/lat)"};if(t.depthM===void 0)return{ok:!1,missing:"set a depth"};const o=new URLSearchParams;if(t.queryType==="position")o.set("coords",`POINT(${t.longitude} ${t.latitude})`);else if(t.queryType==="area"){const n=at(t.longitude,t.latitude);o.set("coords",`POLYGON((${n.map(([r,f])=>`${r} ${f}`).join(", ")}))`)}else return{ok:!1,missing:`the composer does not guide '${t.queryType}' queries`};return o.set("z",String(t.depthM)),t.datetime&&o.set("datetime",t.datetime),t.parameters.length>0&&o.set("parameter-name",t.parameters.join(",")),{ok:!0,url:`${l}/collections/${t.collection}/${t.queryType}?${o.toString()}`}}function at(l,t){const o=re(l-.25),n=re(l+.25),r=re(t-.25),f=re(t+.25);return[[o,r],[n,r],[n,f],[o,f],[o,r]]}function mi(l){if(!l||l.length<2)return;const[t,o]=l;if(!Number.isFinite(t)||!Number.isFinite(o)||o<-90||o>90)return;const n=((t+180)%360+360)%360-180;return{longitude:re(n),latitude:re(o)}}function vi(l,t){return t===void 0?l==="cube"?"click a slice to place the position and depth of the query":"click the map to place the position of the query":`${t} · click again to move it`}function yi(l,t){if(l===200)return{fact:"value",body:t};const o=typeof t=="object"&&t!==null&&"refused"in t?String(t.refused):void 0;return l===404?{fact:"absent",detail:o??"the server answered 404"}:{fact:"declined",refusal:o??`the server answered ${l} with no refusal text`}}function re(l){return Math.round(l*1e3)/1e3}function xi({config:l,validator:t,latestForecast:o,choices:n,onChoices:r,positionNote:f,canPick:v}){const[C,h]=a.useState(),[k,y]=a.useState(),[I,M]=a.useState(!1);a.useEffect(()=>y(void 0),[n]),a.useEffect(()=>{(async()=>{const[d,D]=await Promise.all([fetch(l.endpoints.query_subsets),fetch(`${l.endpoints.edr}/collections`)]);if(!d.ok||!D.ok)return;const j=await d.json();if(!t.validate("query-subsets",j).ok)return;const ge=await D.json();h(gi(j,ge.collections.map(le=>le.id)))})()},[l.endpoints.edr,l.endpoints.query_subsets,t,o]);const w=fi(l.endpoints.edr,n),S=async()=>{if(!w.ok)return;y(void 0);const d=await fetch(w.url),D=await d.json();y(yi(d.status,D))},ee=async()=>{if(w.ok)try{await navigator.clipboard.writeText(w.url),M(!0),setTimeout(()=>M(!1),1500)}catch{M(!1)}};return C?i.jsxs("div",{className:"composer",children:[i.jsx("h4",{children:"compose an EDR request"}),i.jsxs("label",{children:["1 · collection"," ",i.jsxs("select",{value:n.collection??"",onChange:d=>r({collection:d.target.value||void 0}),children:[i.jsx("option",{value:"",children:"choose…"}),C.collections.map(d=>i.jsx("option",{value:d,children:d},d))]})]}),i.jsxs("label",{children:["2 · query type"," ",i.jsxs("select",{value:n.queryType??"",onChange:d=>r({queryType:d.target.value||void 0}),children:[i.jsx("option",{value:"",children:"choose…"}),C.queryTypes.map(d=>i.jsx("option",{value:d,children:d},d))]})]}),i.jsxs("fieldset",{children:[i.jsx("legend",{children:"3 · parameters (none chosen = every served parameter)"}),C.parameters.map(d=>i.jsxs("label",{className:"composer-parameter",children:[i.jsx("input",{type:"checkbox",checked:n.parameters.includes(d),onChange:D=>r({parameters:D.target.checked?[...n.parameters,d]:n.parameters.filter(j=>j!==d)})}),d]},d))]}),i.jsxs("div",{className:"composer-pick","data-testid":"composer-pick",children:[i.jsxs("p",{className:"composer-pick-lead",children:["4 · position —"," ",v?i.jsx("strong",{children:"click the map to place it"}):i.jsx("strong",{children:"type it below"}),v?", or type it below":": the canvas draws nothing here, so there is no map to click","."]}),i.jsx("p",{className:"composer-pick-drawn",children:"The marker, and an area query's box, are drawn where the URL says."})]}),i.jsxs("label",{children:["longitude"," ",i.jsx("input",{type:"number",step:"0.1",value:n.longitude??"",onChange:d=>r({longitude:d.target.value===""?void 0:Number(d.target.value)})})]}),i.jsxs("label",{children:["latitude"," ",i.jsx("input",{type:"number",step:"0.1",value:n.latitude??"",onChange:d=>r({latitude:d.target.value===""?void 0:Number(d.target.value)})})]}),i.jsx("p",{className:"composer-pick-note","data-testid":"composer-pick-note",children:f??"no position yet"}),i.jsxs("label",{children:["5 · depth (m)"," ",i.jsx("input",{type:"number",step:"10",value:n.depthM??"",onChange:d=>r({depthM:d.target.value===""?void 0:Number(d.target.value)})})]}),i.jsxs("label",{children:["6 · datetime (optional, ISO)"," ",i.jsx("input",{type:"text",placeholder:"collection's first step",value:n.datetime??"",onChange:d=>r({datetime:d.target.value||void 0})})]}),i.jsx("div",{className:"composer-url","data-testid":"composer-url",children:w.ok?i.jsx("code",{children:w.url}):i.jsx("em",{children:w.missing})}),i.jsxs("div",{className:"composer-actions",children:[i.jsx("button",{disabled:!w.ok,onClick:()=>void S(),children:"GET"}),i.jsx("button",{disabled:!w.ok,onClick:()=>void ee(),children:I?"copied":"copy URL"})]}),k&&i.jsxs("div",{className:`composer-result composer-${k.fact}`,"data-testid":"composer-result",children:[k.fact==="value"&&i.jsxs(i.Fragment,{children:[i.jsx("p",{children:"a value came back (null would be a value too, and would say so):"}),i.jsx("pre",{children:JSON.stringify(k.body,null,2)})]}),k.fact==="declined"&&i.jsxs("p",{children:["declined, in the server's words: ",k.refusal]}),k.fact==="absent"&&i.jsxs("p",{children:["absent: ",k.detail]})]})]}):i.jsx("div",{className:"composer",children:"enumerating what the server serves…"})}function bi(){if(typeof WebGL2RenderingContext>"u")return!1;try{return document.createElement("canvas").getContext("webgl2")!==null}catch{return!1}}function Li({params:l}){var qe;const{config:t,client:o,validator:n}=l,r=a.useRef(null),f=_t(r),[v,C]=a.useState(""),[h,k]=a.useState(),[y,I]=a.useState(),[M,w]=a.useState(),[S,ee]=a.useState([]),[d,D]=a.useState({points:[],answered:!1}),[j,ge]=a.useState(),[le,rt]=a.useState([]),[te,fe]=a.useState({}),[Re,Me]=a.useState([]),[$,lt]=a.useState("projection"),[G,me]=a.useState({}),[$e,dt]=a.useState("nowcast"),[O,ct]=a.useState("temperature"),[V,ut]=a.useState(50),[Z,pt]=a.useState(0),[E,ht]=a.useState(!1),[b,ve]=a.useState({parameters:[]}),[ye,gt]=a.useState(),[Ee,ft]=a.useState(),[g,mt]=a.useState("globe"),[K,Ae]=a.useState({levels:[]}),Fe=a.useRef(void 0);Fe.current=K.frame;const z=a.useMemo(bi,[]),Oe=a.useRef(null),[xe,vt]=a.useState(!1);a.useEffect(()=>{const e=Oe.current;if(!(!z||!e||xe))return hi(e,()=>vt(!0))},[z,xe]),a.useEffect(()=>{const e=[o.subscribe(t.topics.clock,s=>{C(s.payload.sim_time)}),o.subscribe(t.topics.plan,s=>k(s.payload)),o.subscribe(t.topics.run_published,s=>I(s.payload)),o.subscribe(t.topics.analysis_published,s=>w(s.payload)),o.subscribe(t.topics.platform_state,s=>ge(s.payload))];return()=>e.forEach(s=>s())},[o,t.topics.clock,t.topics.plan,t.topics.platform_state,t.topics.run_published]),a.useEffect(()=>{let e=!1;return(async()=>{try{const s=await fetch(`${t.endpoints.sensorthings}/Datastreams('ownship/ownship-course')/Observations?%24top=500`);if(!s.ok)return;const u=await s.json();e||D({points:St(u.value??[]),answered:!0})}catch{}})(),()=>{e=!0}},[t.endpoints.sensorthings,j==null?void 0:j.tick]);const be=a.useCallback(async()=>{const e=await fetch(`${t.endpoints.features}/collections/advisories/items`);if(!e.ok)return;const s=await e.json();n.validate("features-response#feature_collection",s).ok&&ee(s.features)},[t.endpoints.features,n]);a.useEffect(()=>(be(),o.subscribe(t.topics.advisories,()=>void be())),[o,t.topics.advisories,be]),a.useEffect(()=>{(async()=>{const e=await fetch(`${t.endpoints.features}/collections/reference/items`);if(!e.ok)return;const s=await e.json();n.validate("features-response#feature_collection",s).ok&&rt(s.features)})()},[t.endpoints.features,n]);const Ce=le.find(e=>e.id==="domain"),L=Ce==null?void 0:Ce.geometry.coordinates[0],_=$e==="forecast"?y==null?void 0:y.collections.forecast:"nowcast",Pe=a.useCallback(async()=>{const e=await fetch(t.endpoints.holdings),s=await e.json();if(!e.ok||!n.validate("holdings-inventory",s).ok){Me([]);return}Me(s.holdings)},[t.endpoints.holdings,n]);a.useEffect(()=>(Pe(),o.subscribe(t.topics.holdings,()=>void Pe())),[o,t.topics.holdings,Pe]);const Te=a.useCallback(e=>e===void 0?void 0:Re.find(s=>s.era===e||s.holding_id===e),[Re]),ie=Te(_),B=a.useMemo(()=>{if(!v)return"";if(Z===0)return v;const e=Date.parse(v.slice(0,23)+"Z")+Z*1e3;return`${new Date(e).toISOString().slice(0,23)}000Z`},[v,Z]),yt=a.useMemo(()=>ie?Ze(ie.manifest.grid.time):[],[ie]),T=Ke(yt,B);a.useEffect(()=>{!L||!_||g==="cube"||(async()=>{const e=`POLYGON((${L.map(([m,P])=>`${m} ${P}`).join(", ")}))`,s=new URLSearchParams({coords:e,z:String(V),"parameter-name":O});T&&s.set("datetime",T.instant);const u=await fetch(`${t.endpoints.edr}/collections/${_}/area?${s.toString()}`),c=await u.json();if(!u.ok){fe({refusal:c.refused??`the area query answered ${u.status}`});return}const p=n.validate("coveragejson",c);if(!p.ok){fe({refusal:`the coverage was refused by its master: ${p.refusals[0]}`});return}const x=c;fe({coverage:x,servedFrom:`${_} at ${Q(x.domain.axes.t.values[0])}, ${x.domain.axes.z.values[0]} m`})})()},[_,t.endpoints.edr,V,L===void 0,O,g,T==null?void 0:T.instant,n,y]);const H=y==null?void 0:y.collections.uncertainty,Ne=Te(H),N=Ke(Ne?Ze(Ne.manifest.grid.time):[],B),se=M==null?void 0:M.collections.provenance,[Y,we]=a.useState({});a.useEffect(()=>{if($!=="provenance"||!L||!se||g==="cube")return;let e=!1;return(async()=>{const s=`POLYGON((${L.map(([A,J])=>`${A} ${J}`).join(", ")}))`,u=new URLSearchParams({coords:s,z:String(V)}),c=await fetch(`${t.endpoints.edr}/collections/${se}/area?${u.toString()}`),p=await c.json();if(e)return;if(!c.ok){we({refusal:`the provenance query was refused: ${c.status}`});return}const x=n.validate("coveragejson",p);if(!x.ok){we({refusal:`the provenance coverage was refused by its master: ${x.refusals[0]}`});return}const m=p,P=Object.keys(m.ranges).filter(A=>A.startsWith("temperature_share_"));we({coverage:m,parameterKeys:P,servedFrom:`${se}, ${m.domain.axes.z.values[0]} m`})})(),()=>{e=!0}},[t.endpoints.edr,V,L,$,g,se,n]),a.useEffect(()=>{if($!=="spread"||!L||!H||g==="cube")return;let e=!1;return(async()=>{const s=`POLYGON((${L.map(([A,J])=>`${A} ${J}`).join(", ")}))`,u=new URLSearchParams({coords:s,z:String(V)});N&&u.set("datetime",N.instant);const c=await fetch(`${t.endpoints.edr}/collections/${H}/area?${u.toString()}`),p=await c.json();if(e)return;if(!c.ok){me({refusal:p.refused??`the spread query answered ${c.status}`});return}const x=n.validate("coveragejson",p);if(!x.ok){me({refusal:`the spread coverage was refused by its master: ${x.refusals[0]}`});return}const m=p,P=Object.keys(m.ranges).find(A=>A.startsWith(O));me({coverage:m,parameterKey:P,refusal:P?void 0:`the spread instance answers for ${Object.keys(m.ranges).join(", ")}, none of which is ${O}`,servedFrom:`${H} at ${Q(m.domain.axes.t.values[0])}, ${m.domain.axes.z.values[0]} m`})})(),()=>{e=!0}},[t.endpoints.edr,V,L===void 0,$,O,g,H,N==null?void 0:N.instant,n]),a.useEffect(()=>{if(g!=="cube"||!L||!_)return;if(!ie){Ae({levels:[],refusal:`the inventory names no holding for collection '${_}', so the depth axis is unknown`});return}let e=!1;return(async()=>{var m;const s=ie.manifest.grid,u=`POLYGON((${L.map(([P,A])=>`${P} ${A}`).join(", ")}))`,c=[],p=[];for(const P of Nt(s.depth)){if(e)return;const A=new URLSearchParams({coords:u,z:String(P),"parameter-name":O}),J=await fetch(`${t.endpoints.edr}/collections/${_}/area?${A.toString()}`),ke=await J.json();if(!J.ok){p.push(`${P} m: ${ke.refused??`answered ${J.status}`}`);continue}const Ge=n.validate("coveragejson",ke);if(!Ge.ok){p.push(`${P} m: refused by its master — ${Ge.refusals[0]}`);continue}const Ve=ke;c.push({requestedDepthM:P,servedDepthM:Ve.domain.axes.z.values[0],coverage:Ve})}if(e)return;const x=(m=c[0])==null?void 0:m.coverage;Ae({levels:c,frame:Wt({west:s.longitude.minimum,east:s.longitude.maximum,south:s.latitude.minimum,north:s.latitude.maximum,deepest:Math.max(...c.map(P=>P.servedDepthM),s.depth.maximum)}),refusal:p.length>0?p.join("; "):void 0,servedFrom:x?`${_} at ${Q(x.domain.axes.t.values[0])} · ${c.length} level(s), one area query each`:void 0})})(),()=>{e=!0}},[_,t.endpoints.edr,L===void 0,ie,O,g,n]);const ce=te.coverage?Le(te.coverage,O):void 0,je=S.filter(e=>Be(e.properties,B)),oe=h?Rt(h,B):void 0,ue=d.points.map(e=>[e.longitude,e.latitude]),pe=j&&j.demanded?Mt(j.current,j.demanded.course_degrees,j.demanded.speed_m_per_s,3600):void 0,We=$==="projection"&&h?$t(h,0):[],W=$==="spread"&&G.coverage&&G.parameterKey?Le(G.coverage,G.parameterKey):void 0,X=$==="provenance"&&Y.coverage&&Y.parameterKeys?Et(Y.coverage,Y.parameterKeys):void 0,xt=a.useCallback(async e=>{if(!_)return;const s=new URLSearchParams({coords:`POINT(${e.longitude} ${e.latitude})`,z:String(e.depth_m),datetime:e.arrival_sim_time}),u=await fetch(`${t.endpoints.edr}/collections/${_}/position?${s.toString()}`),c=await u.json();ft(u.ok&&c.ranges?`stop ${e.sequence} · arrive ${Q(e.arrival_sim_time)} at ${e.depth_m} m: `+Object.entries(c.ranges).map(([p,x])=>{var m;return`${p} ${(m=x.values[0])==null?void 0:m.toFixed(3)}`}).join(", "):`stop ${e.sequence}: ${c.refused??`the position query answered ${u.status}`}`)},[_,t.endpoints.edr]),bt=a.useCallback(e=>{var u;if(!E||((u=e.layer)==null?void 0:u.id)==="route-stops")return;if(g==="cube"){const c=Fe.current,p=e.coordinate;if(!c||!p||p.length<2)return;const{longitude:x,latitude:m}=c.toGeographic(p[0],p[1]);if(!Number.isFinite(x)||!Number.isFinite(m)||Math.abs(m)>90)return;ve(P=>({...P,longitude:x,latitude:m,depthM:p.length>2?Math.round(c.depthAt(p[2])):P.depthM}));return}const s=mi(e.coordinate);s&&ve(c=>({...c,...s}))},[E,g]),Ue=b.longitude===void 0||b.latitude===void 0?void 0:`position ${b.longitude}, ${b.latitude}`+(L===void 0?"":At(L,b.longitude,b.latitude)?" — inside the domain":" — outside the domain: the server will decline, and will say why"),Ie=K.levels.map(e=>({level:e,grid:Le(e.coverage,O)})),De=Ie.flatMap(({grid:e})=>e?[e.minimum,e.maximum]:[]),Ct=Math.min(...De),Pt=Math.max(...De),R=K.frame,ne=R?Ut(R,d.points,pe,j==null?void 0:j.current.depth_m):{track:[],demand:void 0},wt=R?[...Ie.map(({level:e,grid:s})=>s?new Qe({id:`cube-level-${e.requestedDepthM}`,data:s.cells,coordinateSystem:q.CARTESIAN,getPolygon:u=>{const[c,p,x,m]=u.bounds;return[R.toCartesian(c,p,e.servedDepthM),R.toCartesian(x,p,e.servedDepthM),R.toCartesian(x,m,e.servedDepthM),R.toCartesian(c,m,e.servedDepthM)]},getFillColor:u=>{const[c,p,x]=He(u.value,Ct,Pt);return[c,p,x,190]},pickable:!0}):void 0),new F({id:"cube-frame",data:It(R),coordinateSystem:q.CARTESIAN,getPath:e=>e,getColor:[90,95,105,200],getWidth:1,widthUnits:"pixels"}),h&&h.route.vertices.length>0?new F({id:"cube-route",data:[[R.toCartesian(h.platform.longitude,h.platform.latitude,h.platform.depth_m),...h.route.vertices.map(e=>R.toCartesian(e.longitude,e.latitude,e.depth_m))]],coordinateSystem:q.CARTESIAN,getPath:e=>e,getColor:[255,255,255,230],getWidth:3,widthUnits:"pixels"}):void 0,oe?new U({id:"cube-platform",data:[R.toCartesian(oe.longitude,oe.latitude,oe.depthM)],coordinateSystem:q.CARTESIAN,getPosition:e=>e,getRadius:9,radiusUnits:"pixels",billboard:!0,getFillColor:[255,220,0,255],getLineColor:[0,0,0,255],getLineWidth:2,lineWidthUnits:"pixels",stroked:!0}):void 0,ne.track.length>1?new F({id:"cube-ownship-track",data:[ne.track],coordinateSystem:q.CARTESIAN,getPath:e=>e,getColor:[99,190,222,220],getWidth:2,widthUnits:"pixels"}):void 0,ne.track.length>0?new U({id:"cube-ownship-reports",data:ne.track,coordinateSystem:q.CARTESIAN,getPosition:e=>e,getFillColor:[99,190,222,200],getRadius:3,radiusUnits:"pixels",billboard:!0}):void 0,ne.demand?new F({id:"cube-ownship-demand",data:[ne.demand],coordinateSystem:q.CARTESIAN,getPath:e=>e,getColor:[99,190,222,160],getWidth:1.5,widthUnits:"pixels",getDashArray:[6,4]}):void 0,E&&b.longitude!==void 0&&b.latitude!==void 0?new U({id:"cube-pick-position",data:[R.toCartesian(b.longitude,b.latitude,b.depthM??0)],coordinateSystem:q.CARTESIAN,getPosition:e=>e,getRadius:9,radiusUnits:"pixels",billboard:!0,filled:!1,stroked:!0,getLineColor:[20,60,140,255],getLineWidth:2,lineWidthUnits:"pixels"}):void 0].filter(e=>e!==void 0):[],jt=[g==="globe"&&new Qe({id:"sphere",data:[[[-180,-90],[180,-90],[180,90],[-180,90]]],getPolygon:e=>e,getFillColor:[206,210,216,255]}),g==="globe"&&new F({id:"graticule",data:Ft(15),getPath:e=>e,getColor:[150,155,165,160],getWidth:1,widthUnits:"pixels"}),ce&&new he({id:"field",data:ce.cells,getPolygon:e=>{const[s,u,c,p]=e.bounds;return[[s,u],[c,u],[c,p],[s,p]]},getFillColor:e=>He(e.value,ce.minimum,ce.maximum),stroked:!1,pickable:!1}),W&&new he({id:"spread",data:W.cells,getPolygon:e=>{const[s,u,c,p]=e.bounds;return[[s,u],[c,u],[c,p],[s,p]]},getFillColor:e=>[255,255,255,Math.round(190*(W.maximum>W.minimum?(e.value-W.minimum)/(W.maximum-W.minimum):0))],stroked:!1,pickable:!1}),X&&new he({id:"provenance",data:X.cells,getPolygon:e=>{const[s,u,c,p]=e.bounds;return[[s,u],[c,u],[c,p],[s,p]]},getFillColor:e=>{const s=Ye[e.dominant].colour;return[s[0],s[1],s[2],Math.round(60+150*Math.min(Math.max(e.fraction,0),1))]},stroked:!1,pickable:!1}),We.length>0&&new he({id:"doubt",data:We,getPolygon:e=>e.boundary,getFillColor:e=>[255,255,255,Math.round(160*e.fraction)],getLineColor:[30,30,30,120],getLineWidth:1,lineWidthUnits:"pixels",stroked:!0,pickable:!1}),le.length>0&&new F({id:"reference",data:le.map(e=>e.geometry.coordinates[0]),getPath:e=>e,getColor:[40,40,40,200],getWidth:2,widthUnits:"pixels"}),ue.length>1&&new F({id:"ownship-track",data:[ue],getPath:e=>e,getColor:[99,190,222,220],getWidth:2,widthUnits:"pixels"}),ue.length>0&&new U({id:"ownship-reports",data:ue,getPosition:e=>e,getFillColor:[99,190,222,200],getRadius:3,radiusUnits:"pixels"}),pe&&new F({id:"ownship-demand",data:[pe],getPath:e=>e,getColor:[99,190,222,160],getWidth:1.5,widthUnits:"pixels",getDashArray:[6,4]}),je.length>0&&new F({id:"advisories",data:je,getPath:e=>e.geometry.coordinates[0],getColor:[180,30,30,255],getWidth:4,widthUnits:"pixels"}),h&&h.route.vertices.length>0&&[new F({id:"route",data:[[[h.platform.longitude,h.platform.latitude],...h.route.vertices.map(e=>[e.longitude,e.latitude])]],getPath:e=>e,getColor:[255,255,255,230],getWidth:3,widthUnits:"pixels"}),new U({id:"route-stops",data:h.route.vertices,getPosition:e=>[e.longitude,e.latitude],getRadius:6,radiusUnits:"pixels",getFillColor:[0,0,0,255],getLineColor:[255,255,255,255],getLineWidth:2,lineWidthUnits:"pixels",stroked:!0,pickable:!0,onClick:e=>{e.object&&xt(e.object)}})],E&&b.longitude!==void 0&&b.latitude!==void 0&&[...b.queryType==="area"?[new F({id:"pick-area",data:[at(b.longitude,b.latitude)],getPath:e=>e,getColor:[20,60,140,230],getWidth:2,widthUnits:"pixels"})]:[],new U({id:"pick-position",data:[[b.longitude,b.latitude]],getPosition:e=>e,getRadius:9,radiusUnits:"pixels",filled:!1,stroked:!0,getLineColor:[20,60,140,255],getLineWidth:2,lineWidthUnits:"pixels"})],oe&&new U({id:"platform",data:[oe],getPosition:e=>[e.longitude,e.latitude],getRadius:9,radiusUnits:"pixels",getFillColor:[255,220,0,255],getLineColor:[0,0,0,255],getLineWidth:2,lineWidthUnits:"pixels",stroked:!0})].flat().filter(Boolean),ze=g==="cube"?wt:jt,kt=ze.flatMap(e=>(Array.isArray(e)?e:[e]).flatMap(u=>u&&typeof u=="object"&&"id"in u?[String(u.id)]:[])),Lt=(h==null?void 0:h.horizon.span_seconds)??21600;return i.jsxs("div",{className:"panel map-panel",ref:r,"data-narrow":f,"data-projection":g,"data-map-layers":kt.join(" "),children:[i.jsxs("div",{className:"panel-head",children:[i.jsx("span",{className:"panel-head-title",children:"the field, the doubt over it, and the route through it"}),i.jsx(Ot,{tour:Tt()})]}),i.jsx(Xe,{label:"view controls",narrow:f,className:"map-controls-disclosure",children:i.jsxs("div",{className:"map-controls",children:[i.jsxs("label",{children:["field"," ",i.jsxs("select",{value:$e,onChange:e=>dt(e.target.value),children:[i.jsx("option",{value:"nowcast",children:"now-cast"}),i.jsxs("option",{value:"forecast",disabled:!y,children:["latest forecast",y?` (${y.collections.forecast})`:" (none published yet)"]})]})]}),i.jsxs("label",{children:["parameter"," ",i.jsxs("select",{value:O,onChange:e=>ct(e.target.value),children:[i.jsx("option",{value:"temperature",children:"temperature"}),i.jsx("option",{value:"salinity",children:"salinity"})]})]}),i.jsxs("label",{children:["depth"," ",i.jsx("select",{value:V,disabled:g==="cube",title:g==="cube"?"the cube draws every level of the holding’s depth axis":void 0,onChange:e=>ut(Number(e.target.value)),children:[0,50,200,400,600,1e3].map(e=>i.jsxs("option",{value:e,children:[e," m"]},e))})]}),i.jsxs("label",{className:"map-time","data-testid":"time-control",children:["displayed time ",Z===0?"(live)":`(${Z>0?"+":""}${Z}s)`," ",i.jsx("input",{type:"range",min:0,max:Lt,step:600,value:Z,onChange:e=>pt(Number(e.target.value))})]}),i.jsxs("label",{children:["doubt"," ",i.jsxs("select",{value:$,"data-testid":"doubt-select",disabled:g==="cube",onChange:e=>lt(e.target.value),children:[i.jsx("option",{value:"projection",children:"the plan's projection cells"}),i.jsxs("option",{value:"spread",disabled:!H,children:["the run's spread",H?"":" (no run published yet)"]}),i.jsxs("option",{value:"provenance",disabled:!se,children:["where it came from",se?"":" (none published yet)"]}),i.jsx("option",{value:"none",children:"none"})]})]}),i.jsxs("label",{children:["view"," ",i.jsxs("select",{value:g,"data-testid":"projection-select",onChange:e=>mt(e.target.value),children:[i.jsx("option",{value:"globe",children:"globe (drag to rotate)"}),i.jsx("option",{value:"flat",children:"flat"}),i.jsx("option",{value:"cube",children:"depth cube (drag to rotate)"})]})]})]})}),i.jsxs("p",{className:"map-status","data-testid":"ownship-status",children:[d.answered?d.points.length>0?`ownship track: ${d.points.length} reported position(s), drawn point to point`:"no ownship observations have been served: nothing is drawn for the track":"ownship track: not asked for yet",pe?" · demanded course drawn as one hour at the demanded speed":"",g==="cube"&&d.points.length>0?" · in the volume the track is drawn at the depths the platform reported, not at the surface":""," · ",B?`displayed instant ${Q(B)}`:"no clock sample yet",g==="cube"?K.servedFrom?` · volume: ${K.servedFrom}; the depth axis is exaggerated`:" · volume: querying each level…":te.servedFrom?` · field: ${te.servedFrom}`:"",g==="cube"?K.refusal?` · level(s) declined: ${K.refusal}`:"":te.refusal?` · field declined: ${te.refusal}`:"",g!=="cube"&&(T!=null&&T.beyond)?` · the displayed instant is ${T.beyond==="after"?"past the end of":"before the start of"} this holding's time axis, so the field shows its ${T.beyond==="after"?"last":"first"} step`:"",g!=="cube"&&$==="spread"?G.refusal?` · spread declined: ${G.refusal}`:W?` · spread: ${G.servedFrom}, ${W.minimum.toFixed(3)} to ${W.maximum.toFixed(3)} across the shade`+(N!=null&&N.beyond?`; the displayed instant is ${N.beyond==="after"?"past the end of":"before the start of"} this run's horizon, so its ${N.beyond==="after"?"last":"first"} step is shown`:""):" · spread: querying…":"",$==="provenance"?Y.refusal?` · provenance declined: ${Y.refusal}`:X?` · provenance: ${Y.servedFrom}, each cell tinted by the share that owns most of it`+(X.overshooting>0?`; ${X.overshooting} cell(s) hold a share past 100%, where the analysis extrapolated past the reading rather than averaging toward it`:""):" · provenance: querying…":"",h?` · plan ${h.plan_id} (${h.route.vertices.length} stop(s))`:" · no plan published yet",` · ${je.length} of ${S.length} advisory(ies) valid at the displayed instant`]}),$==="provenance"&&X?i.jsx("ul",{className:"map-legend","aria-label":"what the provenance tint means",children:Ye.map((e,s)=>i.jsxs("li",{children:[i.jsx("span",{className:"map-legend-swatch",style:{background:`rgb(${e.colour[0]}, ${e.colour[1]}, ${e.colour[2]})`}}),e.label,` (${X.cells.filter(u=>u.dominant===s).length} cell(s))`]},e.label))}):null,Ee&&i.jsx("p",{className:"map-arrival",children:Ee}),i.jsxs("div",{className:"map-compose",children:[i.jsx("button",{className:"map-compose-toggle","data-testid":"composer-toggle","aria-expanded":E,onClick:()=>ht(e=>!e),children:E?"close the composer":"compose an EDR query"}),!E&&i.jsxs("span",{className:"map-compose-hint",children:["build a genuine OGC API-EDR request against the served collections",z?", placing its position by clicking the map":""]})]}),i.jsxs("div",{className:"map-body",children:[i.jsxs("div",{className:"map-canvas",ref:Oe,"data-picking":E&&z,children:[E&&z&&i.jsx("p",{className:"map-pick-prompt","data-testid":"map-pick-prompt",children:vi(g,Ue)}),z&&xe?i.jsx(ei,{views:g==="globe"?new nt:g==="cube"?new Dt({orbitAxis:"Z"}):new ti,initialViewState:g==="globe"?{longitude:-11,latitude:46,zoom:3.2}:g==="cube"?{target:[0,0,-25],zoom:1.1,rotationX:35,rotationOrbit:25}:{longitude:-11,latitude:46,zoom:5.2},controller:!0,layers:ze,onClick:bt,getCursor:({isDragging:e})=>e?"grabbing":E?"crosshair":"grab",children:null},g):z?null:i.jsx("div",{className:"map-no-webgl",children:i.jsx("p",{children:"WebGL is unavailable here, so the canvas draws nothing — and says so rather than pretending. The documents the map would draw are all below, and every one crossed the seam."})})]}),E&&i.jsx(xi,{config:t,validator:n,latestForecast:y==null?void 0:y.collections.forecast,choices:b,onChoices:e=>ve(s=>({...s,...e})),positionNote:Ue,canPick:z})]}),i.jsx(Xe,{label:"advisories",narrow:f,className:"map-advisories-disclosure",children:i.jsxs("div",{className:"map-advisories",children:[!f&&i.jsx("h4",{children:"advisories (queryable whether or not drawn)"}),f&&i.jsx("p",{className:"panel-footnote",children:"queryable whether or not drawn"}),S.length===0?i.jsx("p",{children:"none yet: the collection is present and stating empty."}):i.jsx("div",{className:"table-scroll",children:i.jsxs("table",{children:[i.jsx("thead",{children:i.jsxs("tr",{children:[i.jsx("th",{children:"id"}),i.jsx("th",{children:"kind"}),i.jsx("th",{children:"valid"}),i.jsx("th",{children:"at the displayed instant"})]})}),i.jsx("tbody",{children:S.map(e=>{const s=e.properties;return i.jsxs("tr",{className:ye===e.id?"selected":void 0,onClick:()=>gt(e.id),children:[i.jsx("td",{children:e.id}),i.jsx("td",{children:s.kind}),i.jsxs("td",{children:[Q(s.valid_time.start_sim_time)," →"," ",Q(s.valid_time.end_sim_time)]}),i.jsx("td",{children:Be(s,B)?"drawn (valid)":"undrawn (outside validity)"})]},e.id)})})]})}),ye&&i.jsx("pre",{className:"map-advisory-detail",children:JSON.stringify((qe=S.find(e=>e.id===ye))==null?void 0:qe.properties,null,2)})]})})]})}export{Li as MapPanel};
