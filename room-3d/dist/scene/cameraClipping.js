// Zoom distance is unrestricted. Adapt the depth range instead of sacrificing
// the precision of every cabinet moulding and fabric fold to a 1:10M frustum.
export function updateCameraClipping(camera,target){
 const distance=camera.position.distanceTo(target);
 const near=Math.max(.0001,distance-8,Math.min(.12,distance*.012));
 const far=Math.max(80,distance+40);
 if(camera.near!==near||camera.far!==far){camera.near=near;camera.far=far;camera.updateProjectionMatrix();}
}
