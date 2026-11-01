// Raw WebGL2 renderer: instanced terrain from a height texture, static architecture, glass,
// analytic sky and a baked sun shadow map. All surface detail is procedural; no photographs ship.

const COMMON = `
const vec3 SUN = normalize(vec3(.60, .60, .53));
const vec3 SUNCOL = vec3(1.0, .90, .76) * 3.1;
float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p), u=f*f*(3.-2.*f);
  return mix(mix(hash21(i),hash21(i+vec2(1,0)),u.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),u.x),u.y); }
float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ s+=a*vnoise(p); p=p*2.03+vec2(17.1,9.2); a*=.5; } return s; }
vec3 skyColor(vec3 d){
  float y = max(d.y, 0.);
  vec3 c = mix(vec3(.74,.80,.86), vec3(.26,.46,.74), pow(y,.48));
  float sd = max(dot(d,SUN),0.);
  c += vec3(1.,.82,.6)*(pow(sd,8.)*.16 + pow(sd,64.)*.3);
  c += vec3(1.,.95,.86)*smoothstep(.9994,.9998,sd)*30.;
  if(d.y>.005){ vec2 q = d.xz/(d.y+.09)*1.25; float n=fbm(q+vec2(3.,1.)); float cl=smoothstep(.48,.78,n)*smoothstep(.01,.13,d.y);
    c = mix(c, vec3(.96,.95,.93)*(.82+.28*fbm(q*2.3+SUN.xz)), cl*.85); }
  return c;
}
vec3 horizon(vec3 d){ // distant fictional dry-bay hills
  vec3 c = skyColor(vec3(d.x, max(d.y,.002), d.z));
  float az = atan(d.z,d.x);
  float h1 = .018+.024*vnoise(vec2(az*5.,1.))+.009*vnoise(vec2(az*19.,3.));
  float h2 = .010+.014*vnoise(vec2(az*9.,7.))+.005*vnoise(vec2(az*33.,5.));
  c = mix(c, vec3(.60,.67,.74), smoothstep(h1+.0015,h1-.0015,d.y));
  c = mix(c, vec3(.56,.60,.60), smoothstep(h2+.0012,h2-.0012,d.y));
  return c;
}
vec3 applyFog(vec3 c, vec3 wp, vec3 cam){
  vec3 v = wp-cam; float dist = length(v);
  float f = 1.-exp(-pow(dist*.00024,1.3));
  vec3 d = v/dist; vec3 fogc = mix(vec3(.74,.79,.83), vec3(.95,.86,.74), pow(max(dot(d,SUN),0.),6.)*.55);
  return mix(c,fogc,clamp(f,0.,.97));
}
vec3 tonemap(vec3 x){ x*=.56; x=(x*(2.51*x+.03))/(x*(2.43*x+.59)+.14); return pow(clamp(x,0.,1.),vec3(1./2.2)); }
`;

const SHADOW_FN = `
uniform highp sampler2DShadow uShadow; uniform mat4 uSunVP;
float shadowAt(vec3 wp, vec3 n){
  vec4 p = uSunVP*vec4(wp+n*.12,1.); vec3 q = p.xyz*.5+.5;
  if(q.x<0.||q.y<0.||q.x>1.||q.y>1.) return 1.;
  float s=0.; const float t=1./4096.;
  for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) s+=texture(uShadow,vec3(q.xy+vec2(x,y)*t,q.z-.00022));
  return s/9.;
}`;

const TERRAIN_VS = `#version 300 es
precision highp float; precision highp sampler2D;
layout(location=0) in vec3 aGrid; layout(location=1) in vec2 iOrigin;
uniform sampler2D uH; uniform mat4 uVP; uniform float uStep; uniform vec2 uX0; uniform ivec2 uSize;
out vec3 vP; out vec2 vUV;
void main(){
  vec2 cell = iOrigin+aGrid.xy*uStep;
  ivec2 ij = clamp(ivec2(cell), ivec2(0), uSize-1);
  float h = texelFetch(uH, ij, 0).r - aGrid.z*(uStep*2.+1.);
  vP = vec3(uX0.x+float(ij.x), h, uX0.y+float(ij.y));
  vUV = (vec2(ij)+.5)/vec2(uSize);
  gl_Position = uVP*vec4(vP,1.);
}`;
const DEPTH_FS = `#version 300 es
precision mediump float; void main(){}`;

const TERRAIN_FS = `#version 300 es
precision highp float;
in vec3 vP; in vec2 vUV; out vec4 o;
uniform sampler2D uSurf, uGrad; uniform vec3 uCam; ${COMMON} ${SHADOW_FN}
vec3 shade(vec3 alb, vec3 n, vec3 wp){
  float ndl = max(dot(n,SUN),0.), sh = shadowAt(wp,n);
  vec3 amb = mix(vec3(.30,.27,.22), vec3(.42,.52,.66), n.y*.5+.5);
  return alb*(SUNCOL*ndl*sh*.52 + amb*.56);
}
void main(){
  vec2 g = (texture(uGrad,vUV).xy-.5)*12.; vec3 n = normalize(vec3(-g.x,1.,-g.y));
  vec4 s = texture(uSurf,vUV);
  float prov = s.r*255./80., roadD = (1.-s.g)*6., veg = s.b, hard = s.a;
  vec2 p = vP.xz; float big = fbm(p*.035), mid = fbm(p*.21), fine = fbm(p*1.7), grit = fbm(p*7.3), slope = 1.-n.y;
  vec3 gn = vec3(mid-.5, 0., fine-.5)*.42+vec3(grit-.5,0.,fbm(p.yx*6.1)-.5)*.3; vec3 N = normalize(n+gn);
  // Measured land: dry olive grass, broken by soil and rock where it steepens
  vec3 grass = mix(vec3(.26,.27,.12), vec3(.46,.40,.20), smoothstep(.3,.7,big+.3*(mid-.5)));
  grass *= .78+.44*grit; grass = mix(grass, vec3(.40,.33,.22), smoothstep(.56,.72,fine)*.6);
  vec3 rock = mix(vec3(.38,.33,.26), vec3(.58,.53,.45), fine)*(.8+.4*grit);
  float rocky = smoothstep(.1,.3,slope+(mid-.5)*.24);
  vec3 land = mix(grass, rock, rocky);
  land = mix(land, mix(vec3(.40,.38,.35),vec3(.50,.48,.44),mid)*(.86+.28*grit), smoothstep(.45,.95,hard)*step(slope,.05));
  float bush = smoothstep(.12,.34,veg+(mid-.5)*.3)*(1.-rocky*.7);
  vec3 shrub = mix(vec3(.11,.17,.08), vec3(.24,.28,.12), fine*.7+mid*.3);
  land = mix(land, shrub, bush*.9);
  N = normalize(N+vec3(mid-.5,0,fine-.5)*bush*1.1);
  // Fictional lower flank: rock under a dark former tide band, silting out toward the plain
  float strata = sin(vP.y*2.1+fbm(p*.06)*9.)*.5+.5;
  vec3 flank = mix(vec3(.33,.28,.22), vec3(.50,.43,.34), mid*.7+strata*.3)*(.74+.5*grit);
  flank = mix(flank, vec3(.17,.16,.14)*(.8+.4*fine), smoothstep(.6,.1,abs(vP.y-.4+(mid-.5)*2.)/2.)*.72);
  flank = mix(flank, vec3(.56,.49,.38)*(.85+.3*grit), smoothstep(-5.,-13.,vP.y+(mid-.5)*5.));
  N = normalize(N+vec3(fine-.5,0.,grit-.5)*.5*smoothstep(-13.,-4.,vP.y)*step(1.5,prov));
  float rip = sin(p.x*.52+p.y*.31+5.*big)*.5+.5, crack = smoothstep(.04,.012,abs(fbm(p*.19)-.5))*.42;
  vec3 plain = mix(vec3(.50,.44,.33), vec3(.60,.53,.41), big)*(.9+.12*rip*fine+.16*grit)-crack*vec3(.15,.14,.11);
  plain = mix(plain, vec3(.36,.32,.25), smoothstep(.56,.72,fbm(p*.012))*.45);
  float t = smoothstep(1.6,2.1,prov+(mid-.5)*.5); vec3 alb = mix(land,flank,t);
  float pl = smoothstep(2.5,2.9,prov); alb = mix(alb,plain,pl);
  // Road surface
  float road = smoothstep(3.08,2.9,roadD);
  float kerb = smoothstep(3.5,3.25,roadD)*(1.-road);
  vec3 asphalt = mix(vec3(.21,.21,.21),vec3(.27,.27,.26),mid)*(.88+.24*fine);
  alb = mix(alb, vec3(.5,.48,.44), kerb*.8); alb = mix(alb, asphalt, road);
  N = normalize(mix(N,n,max(road,kerb)));
  vec3 c = shade(alb,N,vP);
  c = applyFog(c,vP,uCam);
  o = vec4(tonemap(c),1.);
}`;

const STATIC_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec3 aC; layout(location=3) in float aM;
uniform mat4 uVP; out vec3 vP, vN, vC; flat out int vM;
void main(){ vP=aP; vN=aN; vC=aC; vM=int(aM+.5); gl_Position=uVP*vec4(aP,1.); }`;

const STATIC_FS = `#version 300 es
precision highp float; precision highp sampler2D;
in vec3 vP, vN, vC; flat in int vM; out vec4 o;
uniform vec3 uCam; uniform sampler2D uH; uniform vec2 uX0; uniform ivec2 uSize; ${COMMON} ${SHADOW_FN}
void main(){
  vec3 n = normalize(vN), a = vC; vec3 w = vP;
  vec2 q = abs(n.y)>.7 ? w.xz : (abs(n.x)>abs(n.z) ? vec2(w.z,w.y) : vec2(w.x,w.y));
  float m=fbm(q*.6), f=fbm(q*4.3); float rough=.9; float spec=.03;
  if(vM==0){ // painted plaster, with weather streaks falling from ledges
    float streak=fbm(vec2(q.x*1.7,q.y*.07)); a*=.86+.26*m; a*=1.-.17*smoothstep(.52,.74,streak); a*=.97+.06*f;
  } else if(vM==1){ float board=step(.5,fract(q.y*.8))*.03; a*=.80+.34*m+board; a*=.95+.1*f;
  } else if(vM==2){ a*=.72+.6*f; a*=.86+.28*m;
  } else if(vM==3){ float row=fract(q.y*2.2), tile=fract(q.x*3.+step(.5,fract(q.y*1.1))*.5); a*=.76+.3*smoothstep(0.,.3,row)*smoothstep(0.,.15,abs(tile-.5)*2.)+.2*m; n=normalize(n+vec3(0,0,sin(q.x*19.))*.05);
  } else if(vM==4){ a*=.82+.34*m; spec=.28; rough=.45;
  } else if(vM==5){ a*=.84+.28*fbm(q*vec2(.8,7.));
  } else if(vM==7){ a*=.7+.75*f; n=normalize(n+vec3(f-.5,m-.5,f*.7-.35)*1.2); rough=1.;
  } else if(vM==8){ float r=step(.08,fract(q.y*4.2)); float b=step(.05,fract(q.x*2.1+step(.5,fract(q.y*2.1))*.5));
    float fade=clamp(1.-fwidth(q.y)*9.,0.,1.); a*=mix(.9,.72+.32*r*b,fade)*(.86+.3*m);
  } else if(vM==9){ float r=step(.06,fract(q.y*1.8)); float b=step(.04,fract(q.x*.9+step(.5,fract(q.y*.9))*.5));
    float fade=clamp(1.-fwidth(q.y)*5.,0.,1.); a*=mix(.92,.76+.24*r*b,fade)*(.76+.46*m);
  } else if(vM==10){ a*=.7+.6*fbm(q*vec2(9.,1.));
  }
  vec3 c;
  if(vM==6){ c = a*(vec3(.46,.48,.5)+.2*max(n.y,0.)); } else {
    float ndl=max(dot(n,SUN),0.), sh=shadowAt(w,n);
    vec3 amb=mix(vec3(.28,.25,.21),vec3(.45,.54,.68),n.y*.5+.5);
    ivec2 ij=clamp(ivec2(w.xz-uX0),ivec2(0),uSize-1); float gy=texelFetch(uH,ij,0).r;
    float ao=mix(.52,1.,smoothstep(0.,1.6,w.y-gy));
    vec3 V=normalize(uCam-w), H=normalize(V+SUN);
    c=a*(SUNCOL*ndl*sh*.52+amb*.58*ao)+SUNCOL*spec*.5*pow(max(dot(n,H),0.),32./rough)*sh*ndl;
  }
  c=applyFog(c,w,uCam); o=vec4(tonemap(c),1.);
}`;

const GLASS_FS = `#version 300 es
precision highp float;
in vec3 vP, vN, vC; flat in int vM; out vec4 o; uniform vec3 uCam; ${COMMON}
void main(){
  vec3 n=normalize(vN), V=normalize(uCam-vP); if(dot(n,V)<0.) n=-n;
  float fr=.06+.94*pow(1.-max(dot(n,V),0.),4.);
  vec3 R=reflect(-V,n); vec3 sky=horizon(vec3(R.x,abs(R.y),R.z));
  vec3 c=mix(vC*.34,sky,fr+.1); c=applyFog(c,vP,uCam);
  o=vec4(tonemap(c),mix(.5,.92,fr));
}`;

const SKY_VS = `#version 300 es
precision highp float; out vec2 vC; void main(){ vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2); vC=p*2.-1.; gl_Position=vec4(vC,1.,1.); }`;
const SKY_FS = `#version 300 es
precision highp float; in vec2 vC; out vec4 o; uniform mat4 uIVP; uniform vec3 uCam; ${COMMON}
void main(){ vec4 f=uIVP*vec4(vC,1.,1.); vec3 d=normalize(f.xyz/f.w-uCam); o=vec4(tonemap(horizon(d)),1.); }`;

function program(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const h = gl.createShader(t); gl.shaderSource(h, s); gl.compileShader(h);
    if (!gl.getShaderParameter(h, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(h));
    gl.attachShader(p, h);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
  return { p, u };
}

export const mat = {
  mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[r + 4] * b[c * 4 + 1] + a[r + 8] * b[c * 4 + 2] + a[r + 12] * b[c * 4 + 3]; return o; },
  persp(fovy, asp, n, f) { const t = 1 / Math.tan(fovy / 2); return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]); },
  ortho(hw, n, f) { return new Float32Array([1 / hw, 0, 0, 0, 0, 1 / hw, 0, 0, 0, 0, -2 / (f - n), 0, 0, 0, -(f + n) / (f - n), 1]); },
  look(e, c, up) {
    const z = norm([e[0] - c[0], e[1] - c[1], e[2] - c[2]]), x = norm(cross(up, z)), y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]);
  },
  invert(m) {
    const a = m, r = new Float32Array(16);
    const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4], b03 = a[1] * a[6] - a[2] * a[5], b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6];
    const b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12], b08 = a[8] * a[15] - a[11] * a[12], b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
    const d = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
    r[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * d; r[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * d; r[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * d; r[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * d;
    r[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * d; r[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * d; r[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * d; r[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * d;
    r[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * d; r[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * d; r[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * d; r[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * d;
    r[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * d; r[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * d; r[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * d; r[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * d;
    return r;
  },
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };

const PATCH = 32;
export class Renderer {
  constructor(canvas, meta, heights, surface, built) {
    const gl = canvas.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl; this.canvas = canvas; this.meta = meta;
    this.progT = program(gl, TERRAIN_VS, TERRAIN_FS);
    this.progS = program(gl, STATIC_VS, STATIC_FS);
    this.progG = program(gl, STATIC_VS, GLASS_FS);
    this.progSky = program(gl, SKY_VS, SKY_FS);
    this.progDT = program(gl, TERRAIN_VS, DEPTH_FS);
    this.progDS = program(gl, STATIC_VS, DEPTH_FS);
    this.emptyVAO = gl.createVertexArray();
    this.initTextures(heights, surface);
    this.initTerrain();
    this.opaque = this.staticVAO(built.opaque); this.glass = this.staticVAO(built.glass);
    this.initShadow();
    this.stats = { tris: 0, fps: 0 };
  }

  tex(unit, w, h, ifmt, fmt, type, data, filter) {
    const gl = this.gl, t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  initTextures(H, surface) {
    const gl = this.gl, { width: w, height: h } = this.meta;
    this.tex(0, w, h, gl.R32F, gl.RED, gl.FLOAT, H, gl.NEAREST);
    this.tex(1, w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, surface, gl.LINEAR);
    const grad = new Uint8Array(w * h * 4);
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const i = r * w + c, gx = (H[r * w + Math.min(w - 1, c + 1)] - H[r * w + Math.max(0, c - 1)]) / 2, gz = (H[Math.min(h - 1, r + 1) * w + c] - H[Math.max(0, r - 1) * w + c]) / 2;
      grad[i * 4] = Math.max(0, Math.min(255, (gx / 12 + .5) * 255)); grad[i * 4 + 1] = Math.max(0, Math.min(255, (gz / 12 + .5) * 255));
    }
    this.tex(2, w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, grad, gl.LINEAR);
  }
  initTerrain() {
    const gl = this.gl; this.lods = [];
    for (const step of [1, 2, 4, 8]) {
      const n = PATCH / step, s = n + 3, verts = new Float32Array(s * s * 3), idx = [];
      // Grid with one extra ring on each side: that ring is the crack-hiding skirt.
      for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
        const a = Math.max(0, Math.min(n, i - 1)), b = Math.max(0, Math.min(n, j - 1)), k = (j * s + i) * 3;
        verts[k] = a; verts[k + 1] = b; verts[k + 2] = i === 0 || j === 0 || i === s - 1 || j === s - 1 ? 1 : 0;
      }
      for (let j = 0; j + 1 < s; j++) for (let i = 0; i + 1 < s; i++) { const p = j * s + i; idx.push(p, p + 1, p + s, p + 1, p + s + 1, p + s); }
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);
      const inst = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, inst);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(1, 1);
      this.lods.push({ step, vao, count: idx.length, inst, data: new Float32Array(4096), n: 0 });
    }
    this.patches = [];
    for (let z = 0; z < this.meta.height - 1; z += PATCH) for (let x = 0; x < this.meta.width - 1; x += PATCH) this.patches.push([x, z]);
    // Plain beyond the grid: a large quad just below -15 m.
    const P = 9000, qv = new Float32Array([-P, -15.02, -P, 0, 1, 0, .7, .63, .5, 0, P, -15.02, -P, 0, 1, 0, .7, .63, .5, 0, P, -15.02, P, 0, 1, 0, .7, .63, .5, 0, -P, -15.02, -P, 0, 1, 0, .7, .63, .5, 0, P, -15.02, P, 0, 1, 0, .7, .63, .5, 0, -P, -15.02, P, 0, 1, 0, .7, .63, .5, 0]);
    this.farPlain = this.staticVAO(qv);
  }
  staticVAO(data) {
    const gl = this.gl, vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const sz = 40; [[0, 3, 0], [1, 3, 12], [2, 3, 24], [3, 1, 36]].forEach(([l, n, o]) => { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, sz, o); });
    return { vao, count: data.length / 10 };
  }
  initShadow() {
    const gl = this.gl, S = 4096;
    const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT32F, S, S);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, t, 0);
    gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
    const sun = norm([.60, .60, .53]), ctr = [20, 10, -50], dist = 900;
    const view = mat.look([ctr[0] + sun[0] * dist, ctr[1] + sun[1] * dist, ctr[2] + sun[2] * dist], ctr, [0, 1, 0]);
    this.sunVP = mat.mul(mat.ortho(430, 10, 1800), view);
    gl.viewport(0, 0, S, S); gl.clear(gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 3);
    this.setLOD(() => 2);
    this.drawTerrain(this.progDT, this.sunVP);
    gl.useProgram(this.progDS.p); gl.uniformMatrix4fv(this.progDS.u.uVP, false, this.sunVP);
    gl.bindVertexArray(this.opaque.vao); gl.drawArrays(gl.TRIANGLES, 0, this.opaque.count);
    gl.disable(gl.POLYGON_OFFSET_FILL); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  setLOD(fn) {
    for (const l of this.lods) l.n = 0;
    for (const [x, z] of this.patches) {
      const l = this.lods[fn(x, z)]; l.data[l.n * 2] = x; l.data[l.n * 2 + 1] = z; l.n++;
    }
  }
  drawTerrain(prog, vp) {
    const gl = this.gl, u = prog.u; gl.useProgram(prog.p);
    gl.uniform1i(u.uH, 0); gl.uniformMatrix4fv(u.uVP, false, vp);
    gl.uniform2f(u.uX0, this.meta.x0, this.meta.z0); gl.uniform2i(u.uSize, this.meta.width, this.meta.height);
    let tris = 0;
    for (const l of this.lods) {
      if (!l.n) continue;
      gl.bindVertexArray(l.vao); gl.bindBuffer(gl.ARRAY_BUFFER, l.inst); gl.bufferData(gl.ARRAY_BUFFER, l.data.subarray(0, l.n * 2), gl.DYNAMIC_DRAW);
      gl.uniform1f(u.uStep, l.step); gl.drawElementsInstanced(gl.TRIANGLES, l.count, gl.UNSIGNED_INT, 0, l.n);
      tris += l.count / 3 * l.n;
    }
    return tris;
  }
  bindCommon(u, vp, cam) {
    const gl = this.gl;
    if (u.uVP) gl.uniformMatrix4fv(u.uVP, false, vp); if (u.uCam) gl.uniform3fv(u.uCam, cam);
    if (u.uSunVP) gl.uniformMatrix4fv(u.uSunVP, false, this.sunVP); if (u.uShadow) gl.uniform1i(u.uShadow, 3);
    if (u.uH) gl.uniform1i(u.uH, 0); if (u.uSurf) gl.uniform1i(u.uSurf, 1); if (u.uGrad) gl.uniform1i(u.uGrad, 2);
    if (u.uX0) gl.uniform2f(u.uX0, this.meta.x0, this.meta.z0); if (u.uSize) gl.uniform2i(u.uSize, this.meta.width, this.meta.height);
  }
  render(cam, yaw, pitch) {
    const gl = this.gl, c = this.canvas, dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    gl.viewport(0, 0, w, h);
    const cp = Math.cos(pitch), f = [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
    const view = mat.look(cam, [cam[0] + f[0], cam[1] + f[1], cam[2] + f[2]], [0, 1, 0]);
    const vp = mat.mul(mat.persp(62 * Math.PI / 180, w / h, .18, 12000), view);
    gl.clearColor(.7, .75, .8, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND); gl.depthMask(true);

    const { x0, z0 } = this.meta;
    this.setLOD((x, z) => {
      const d = Math.hypot(x0 + x + PATCH / 2 - cam[0], z0 + z + PATCH / 2 - cam[2], cam[1] < 80 ? 0 : cam[1] * .4);
      return d < 110 ? 0 : d < 260 ? 1 : d < 560 ? 2 : 3;
    });
    gl.useProgram(this.progT.p); this.bindCommon(this.progT.u, vp, cam);
    const tTris = this.drawTerrain(this.progT, vp);
    gl.useProgram(this.progS.p); this.bindCommon(this.progS.u, vp, cam);
    gl.bindVertexArray(this.opaque.vao); gl.drawArrays(gl.TRIANGLES, 0, this.opaque.count);

    // The far plain re-uses terrain colours through the sky shader's fog, so it reads as distance.
    gl.useProgram(this.progS.p); gl.bindVertexArray(this.farPlain.vao); gl.drawArrays(gl.TRIANGLES, 0, this.farPlain.count);

    gl.useProgram(this.progSky.p); gl.uniformMatrix4fv(this.progSky.u.uIVP, false, mat.invert(vp)); gl.uniform3fv(this.progSky.u.uCam, cam);
    gl.bindVertexArray(this.emptyVAO); gl.depthMask(false); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.depthMask(true);

    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.useProgram(this.progG.p); this.bindCommon(this.progG.u, vp, cam);
    gl.bindVertexArray(this.glass.vao); gl.drawArrays(gl.TRIANGLES, 0, this.glass.count);
    gl.depthMask(true); gl.disable(gl.BLEND);
    this.stats.tris = tTris + this.opaque.count / 3;
  }
}
