import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ARKIT_BLENDSHAPE_NAMES } from '../utils/arkitShapes';

export interface MaterialDepthSettings {
  depthTest: boolean;
  depthWrite: boolean;
  side: THREE.Side;
  forceOpaque: boolean;
}

export class ThreeService {
  private container: HTMLElement | null = null;
  private scene: THREE.Scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera = new THREE.PerspectiveCamera();
  private renderer: THREE.WebGLRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  private controls: OrbitControls | null = null;
  private animationFrameId: number | null = null;

  // Material Settings for fixing blend / backface depth bleed-through
  private materialSettings: MaterialDepthSettings = {
    depthTest: true,
    depthWrite: true,
    side: THREE.FrontSide,
    forceOpaque: false
  };

  // Models
  private defaultAvatarGroup: THREE.Group = new THREE.Group();
  private defaultGltfModel: THREE.Object3D | null = null;
  private defaultMorphTargetMeshes: Array<{ mesh: THREE.Mesh; map: Map<string, number> }> = [];
  private customGltfModel: THREE.Object3D | null = null;
  private activeModel: THREE.Object3D | null = null;
  private customMorphTargetMeshes: Array<{ mesh: THREE.Mesh; map: Map<string, number> }> = [];

  // Wireframe
  private wireframeMesh: THREE.LineSegments | null = null;
  private wireframeVisible = false;

  // MediaPipe Face Mesh Connections for 3D wireframe
  private landmarkPositions: Float32Array = new Float32Array(478 * 3);

  init(container: HTMLElement): void {
    this.container = container;

    // Renderer
    const width = container.clientWidth || 600;
    const height = container.clientHeight || 450;

    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    container.appendChild(this.renderer.domElement);

    // Scene & Background
    this.scene.background = new THREE.Color(0x0f131a);

    // Camera
    this.camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    this.camera.position.set(0, 0.2, 2.5);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 10;
    this.controls.target.set(0, 0, 0);

    // Lighting
    this.setupLighting();

    // Floor Grid / Studio Environment
    this.setupEnvironment();

    // Add default avatar group to scene
    this.scene.add(this.defaultAvatarGroup);
    this.activeModel = this.defaultAvatarGroup;

    // Load Default GLB Model from public/models/head.glb
    this.loadDefaultModel();

    // Wireframe Mesh overlay
    this.createLandmarkWireframe();

    // Handle Resize
    window.addEventListener('resize', this.onResize);

    // Start Loop
    this.animate();
  }

  private setupLighting(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(2, 4, 3);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    this.scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x7080ff, 0.6);
    fillLight.position.set(-2, 1, -2);
    this.scene.add(fillLight);

    const rimLight = new THREE.PointLight(0x38bdf8, 1.0, 5);
    rimLight.position.set(0, 2, -2);
    this.scene.add(rimLight);
  }

  private setupEnvironment(): void {
    const grid = new THREE.GridHelper(10, 20, 0x38bdf8, 0x1e293b);
    grid.position.y = -1.2;
    grid.material.opacity = 0.4;
    grid.material.transparent = true;
    this.scene.add(grid);
  }

  private frameModel(model: THREE.Object3D): void {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 1.0 / (maxDim || 1);
    model.scale.setScalar(scale);
    model.position.sub(center.multiplyScalar(scale));
  }

  private inspectMorphTargets(model: THREE.Object3D): Array<{ mesh: THREE.Mesh; map: Map<string, number> }> {
    const result: Array<{ mesh: THREE.Mesh; map: Map<string, number> }> = [];
    model.traverse(child => {
      if (child instanceof THREE.Mesh && child.morphTargetDictionary && child.morphTargetInfluences) {
        const map = new Map<string, number>();
        for (const [name, index] of Object.entries(child.morphTargetDictionary)) {
          const matchedName = ARKIT_BLENDSHAPE_NAMES.find(
            arkit => arkit.toLowerCase() === name.toLowerCase() || name.toLowerCase().includes(arkit.toLowerCase())
          );
          if (matchedName) {
            map.set(matchedName, index);
          }
        }
        result.push({ mesh: child as THREE.Mesh, map });
      }
    });
    return result;
  }

  async loadDefaultModel(): Promise<void> {
    const loader = new GLTFLoader();
    try {
      const gltf = await loader.loadAsync('/models/head.glb');
      if (this.defaultGltfModel) {
        this.defaultAvatarGroup.remove(this.defaultGltfModel);
      }
      this.defaultGltfModel = gltf.scene;
      this.frameModel(this.defaultGltfModel);
      this.defaultMorphTargetMeshes = this.inspectMorphTargets(this.defaultGltfModel);

      this.defaultAvatarGroup.add(this.defaultGltfModel);
      this.applyMaterialSettings(this.defaultAvatarGroup);
    } catch (err) {
      console.warn('Default preview model public/models/head.glb not loaded yet:', err);
    }
  }

  private createLandmarkWireframe(): void {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.landmarkPositions, 3));

    const mat = new THREE.LineBasicMaterial({
      color: 0x34d399,
      linewidth: 1.5,
      transparent: true,
      opacity: 0.8
    });

    this.wireframeMesh = new THREE.LineSegments(geo, mat);
    this.wireframeMesh.visible = this.wireframeVisible;
    this.wireframeMesh.position.set(0, 0, 0.8);
    this.scene.add(this.wireframeMesh);
  }

  updateBlendshapes(weights: number[]): void {
    const activeMorphTargets = this.customGltfModel && this.customMorphTargetMeshes.length > 0
      ? this.customMorphTargetMeshes
      : this.defaultMorphTargetMeshes;

    if (activeMorphTargets.length > 0) {
      for (const item of activeMorphTargets) {
        const { mesh, map } = item;
        if (!mesh.morphTargetInfluences) continue;

        ARKIT_BLENDSHAPE_NAMES.forEach((shapeName, index) => {
          const weight = weights[index] ?? 0;
          const targetIndex = map.get(shapeName);
          if (targetIndex !== undefined) {
            mesh.morphTargetInfluences![targetIndex] = weight;
          }
        });
      }
    }
  }

  updateFaceLandmarks3D(landmarks: Array<{ x: number; y: number; z: number }>): void {
    if (!this.wireframeMesh || !this.wireframeVisible || landmarks.length === 0) return;

    const posAttr = this.wireframeMesh.geometry.attributes.position as THREE.BufferAttribute;
    const array = posAttr.array as Float32Array;

    // Scale and map normalized MediaPipe 3D coordinates to Three.js space
    for (let i = 0; i < landmarks.length && i < 478; i++) {
      const lm = landmarks[i];
      // center around origin
      array[i * 3] = (lm.x - 0.5) * -1.5;
      array[i * 3 + 1] = (0.5 - lm.y) * 1.5;
      array[i * 3 + 2] = -lm.z * 1.5;
    }

    posAttr.needsUpdate = true;
  }

  setWireframeVisible(visible: boolean): void {
    this.wireframeVisible = visible;
    if (this.wireframeMesh) {
      this.wireframeMesh.visible = visible;
    }
  }

  async loadCustomGLTF(file: File): Promise<void> {
    const url = URL.createObjectURL(file);
    const loader = new GLTFLoader();

    try {
      const gltf = await loader.loadAsync(url);
      if (this.customGltfModel) {
        this.scene.remove(this.customGltfModel);
      }

      this.customGltfModel = gltf.scene;
      this.frameModel(this.customGltfModel);
      this.customMorphTargetMeshes = this.inspectMorphTargets(this.customGltfModel);

      // Switch view
      this.defaultAvatarGroup.visible = false;
      this.applyMaterialSettings(this.customGltfModel);
      this.scene.add(this.customGltfModel);
      this.activeModel = this.customGltfModel;

      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error loading custom GLTF:', err);
      URL.revokeObjectURL(url);
      throw err;
    }
  }

  resetToDefaultAvatar(): void {
    if (this.customGltfModel) {
      this.scene.remove(this.customGltfModel);
      this.customGltfModel = null;
      this.customMorphTargetMeshes = [];
    }
    this.defaultAvatarGroup.visible = true;
    this.activeModel = this.defaultAvatarGroup;
    this.applyMaterialSettings(this.defaultAvatarGroup);
  }

  getMaterialSettings(): MaterialDepthSettings {
    return { ...this.materialSettings };
  }

  updateMaterialSettings(settings: Partial<MaterialDepthSettings>): void {
    this.materialSettings = { ...this.materialSettings, ...settings };
    if (this.activeModel) {
      this.applyMaterialSettings(this.activeModel);
    }
  }

  applyMaterialSettings(object: THREE.Object3D | null): void {
    if (!object) return;
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((mat) => {
          if (mat instanceof THREE.Material) {
            mat.depthTest = this.materialSettings.depthTest;
            mat.depthWrite = this.materialSettings.depthWrite;
            mat.side = this.materialSettings.side;

            if (this.materialSettings.forceOpaque) {
              mat.transparent = false;
              mat.opacity = 1.0;
            } else if (mat.transparent) {
              // Ensure depth write is true even if transparent to prevent backfacing/inside cavity polygons from showing through
              mat.depthWrite = this.materialSettings.depthWrite;
              if (mat.alphaTest === 0) {
                mat.alphaTest = 0.05;
              }
            }

            mat.needsUpdate = true;
          }
        });
      }
    });
  }

  private onResize = (): void => {
    if (!this.container) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private animate = (): void => {
    this.animationFrameId = requestAnimationFrame(this.animate);
    this.controls?.update();

    // Gentle idle sway if no keyframes active
    if (this.activeModel && this.defaultAvatarGroup.visible) {
      this.defaultAvatarGroup.rotation.y = Math.sin(Date.now() * 0.0005) * 0.05;
    }

    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }
}

export const threeService = new ThreeService();
