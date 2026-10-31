import * as THREE from 'three';

/**
 * Generates a clean, procedural studio-sea-mist HDRI environment map via PMREMGenerator
 * once at startup (0 per-frame cost!) so PBR materials on the Torii Gate
 * (Gold calligraphy, Bronze fittings, Copper roof, Wet vermilion cedar) have rich 3D specular reflections
 * instead of looking flat!
 */
export function createMysticSeaEnvironment(gl: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(gl);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();

  // Soft atmospheric dome gradient inside the cubemap
  const domeGeo = new THREE.SphereGeometry(50, 32, 24);
  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: /* glsl */ `
      varying vec3 vPos;
      void main() {
        vPos = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vPos;
      void main() {
        float y = vPos.y;
        // Upper sky: luminous cool-warm misty pearl; Lower hemisphere: dark reflective sea bounce
        vec3 zenith  = vec3(0.55, 0.65, 0.78);
        vec3 horizon = vec3(0.95, 0.92, 0.88);
        vec3 sea     = vec3(0.06, 0.10, 0.14);

        vec3 col = y >= 0.0
          ? mix(horizon, zenith, pow(y, 0.6))
          : mix(horizon * 0.45, sea, pow(-y, 0.45));

        // Bright directional sun/moon softbox highlight at (-0.55, 0.45, 0.55) for crisp 3D cylindrical specular rolloff!
        vec3 keyDir = normalize(vec3(-0.55, 0.48, 0.55));
        float sunSpot = pow(max(0.0, dot(vPos, keyDir)), 18.0);
        col += vec3(1.8, 1.55, 1.25) * sunSpot;

        // Subtle cool rim highlight opposite
        vec3 rimDir = normalize(vec3(0.65, 0.35, -0.60));
        float rimSpot = pow(max(0.0, dot(vPos, rimDir)), 12.0);
        col += vec3(0.45, 0.72, 0.95) * rimSpot;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const dome = new THREE.Mesh(domeGeo, domeMat);
  envScene.add(dome);

  const renderTarget = pmrem.fromScene(envScene, 0.035);
  domeGeo.dispose();
  domeMat.dispose();
  pmrem.dispose();

  return renderTarget.texture;
}
