import {
  FramebufferTexture,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';

/**
 * Optional tilt-shift: a sharp band across the middle of the screen and a soft blur above and
 * below, strongest when zoomed in, for a miniature look. It works on the finished frame (after
 * tone mapping), so it never changes how the scene itself is lit: copy the frame, blur it
 * horizontally into a target, then blur vertically back onto the screen.
 */
export class TiltShift {
  private src: FramebufferTexture | null = null;
  private mid: WebGLRenderTarget | null = null;
  private scene = new Scene();
  private camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: ShaderMaterial;
  private size = new Vector2();
  private origin = new Vector2(0, 0);
  /** Frames the effect ran (tests read this). */
  frames = 0;

  constructor() {
    this.mat = new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTex: { value: null },
        uStep: { value: new Vector2() },
        uAmount: { value: 0 },
        uFocus: { value: 0.45 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex;
        uniform vec2 uStep;
        uniform float uAmount;
        uniform float uFocus;
        varying vec2 vUv;
        void main() {
          // Blur radius grows away from the focus band (a little below the centre of the view).
          float d = abs(vUv.y - uFocus);
          float r = smoothstep(0.1, 0.5, d) * uAmount;
          vec4 c = texture2D(uTex, vUv) * 0.2270270270;
          c += texture2D(uTex, vUv + uStep * r * 1.3846153846) * 0.3162162162;
          c += texture2D(uTex, vUv - uStep * r * 1.3846153846) * 0.3162162162;
          c += texture2D(uTex, vUv + uStep * r * 3.2307692308) * 0.0702702703;
          c += texture2D(uTex, vUv - uStep * r * 3.2307692308) * 0.0702702703;
          gl_FragColor = vec4(c.rgb, 1.0);
        }`,
    });
    const quad = new Mesh(new PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  /** Run on the frame just rendered to the screen. `amount` 0–1 scales the blur. */
  apply(renderer: WebGLRenderer, amount: number): void {
    if (amount <= 0.01) return;
    renderer.getDrawingBufferSize(this.size);
    const w = this.size.x;
    const h = this.size.y;
    if (!this.src || this.src.image.width !== w || this.src.image.height !== h) {
      this.src?.dispose();
      this.mid?.dispose();
      this.src = new FramebufferTexture(w, h);
      this.mid = new WebGLRenderTarget(w, h, { depthBuffer: false });
    }
    renderer.copyFramebufferToTexture(this.src, this.origin);
    const u = this.mat.uniforms;
    const px = 3.2 * amount * Math.max(1, h / 800);
    u.uAmount!.value = px;
    u.uTex!.value = this.src;
    (u.uStep!.value as Vector2).set(1 / w, 0);
    renderer.setRenderTarget(this.mid);
    renderer.render(this.scene, this.camera);
    u.uTex!.value = this.mid!.texture;
    (u.uStep!.value as Vector2).set(0, 1 / h);
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
    this.frames++;
  }
}
