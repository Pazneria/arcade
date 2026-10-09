// One projective map drives the physical screen and pointer coordinates.
// Quad order is top-left, top-right, bottom-left, bottom-right.
export function screenProjection(quad,width=800,height=600) {
  if(!quad||quad.length!==4||quad.some(p=>![p.x,p.y].every(Number.isFinite))||width<=0||height<=0)return null;
  const [p0,p1,p2,p3]=quad;
  const dx1=p1.x-p3.x,dx2=p2.x-p3.x,dy1=p1.y-p3.y,dy2=p2.y-p3.y;
  const dx3=p0.x-p1.x-p2.x+p3.x,dy3=p0.y-p1.y-p2.y+p3.y;
  const denominator=dx1*dy2-dx2*dy1;
  if(Math.abs(denominator)<1e-7)return null;
  const g=(dx3*dy2-dx2*dy3)/denominator,h=(dx1*dy3-dx3*dy1)/denominator;
  const a=p1.x-p0.x+g*p1.x,b=p2.x-p0.x+h*p2.x,c=p0.x;
  const d=p1.y-p0.y+g*p1.y,e=p2.y-p0.y+h*p2.y,f=p0.y;
  const area=Math.abs((p1.x-p0.x)*(p2.y-p0.y)-(p1.y-p0.y)*(p2.x-p0.x));
  if(area<400||[1,1+g,1+h,1+g+h].some(w=>w<=.001))return null;
  const matrix=[a/width,d/width,0,g/width,b/height,e/height,0,h/height,0,0,1,0,c,f,0,1];
  function point(u,v){const w=g*u+h*v+1;return {x:(a*u+b*v+c)/w,y:(d*u+e*v+f)/w};}
  function uv(x,y){
    const A=a-x*g,B=b-x*h,D=d-y*g,E=e-y*h,det=A*E-B*D;
    if(Math.abs(det)<1e-8)return null;
    const u=((x-c)*E-B*(y-f))/det,v=(A*(y-f)-(x-c)*D)/det;
    return Number.isFinite(u)&&Number.isFinite(v)&&u>=0&&u<=1&&v>=0&&v<=1?{u,v}:null;
  }
  return {matrix,css:`matrix3d(${matrix.join(',')})`,point,uv,width,height};
}
