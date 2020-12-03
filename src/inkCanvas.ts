import { Color4, Color3 } from "@babylonjs/core/Maths/math.color";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Material } from "@babylonjs/core/Materials/material";
import { PointerInfo } from "@babylonjs/core/Events/pointerEvents";
import { Nullable } from "@babylonjs/core/types";
import { KeyboardInfo } from "@babylonjs/core/Events/keyboardEvents";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Observable } from "@babylonjs/core/Misc/observable";

import { PathBufferDataOptions } from "./path/pathBufferData";
import { PathMesh } from "./path/pathMesh";

import { createDebugMaterial } from "./materials/debugMaterial";
import { createSimpleMaterial } from "./materials/simpleMaterial";
import { createRainbowMaterial, getColorAtToRef } from "./materials/rainbowMaterial";

/**
 * Various brush modes
 */
const enum Brush {
    /**
     * Normal pen mode
     */
    pen,
}

/**
 * The canvas is responsible to create and orchestrate all the resources
 * the ink platform would need (scene, camera...)
 */
export class InkCanvas {
    private readonly _debug: boolean;
    private readonly _scene: Scene;
    private readonly _pointerNode: Vector3;

    private readonly _paths: PathMesh[];
    private readonly _redoPaths: PathMesh[];

    private _currentPath: Nullable<PathMesh> = null;
    private _currentSize: number;
    private _currentColor: Color3;
    private _currentMode: Brush;

    /**
     * Creates an instance of an ink canvas associated to a html canvas element
     * @param canvas defines the html element to transform into and ink surface
     * @param particleTextureURL defines the URL of the texture used for the rainbow particle effects
     * @param debug defines wheter the ink canvas is in debug mode or not (wireframe, input debounced...)
     */
    constructor(scene: Scene, debug = false) {
        this._debug = debug;
        this._paths = [];
        this._redoPaths = [];
        this._currentPath = null;
        this._currentSize = 5;
        this._currentColor = Color3.White();
        this._currentMode = Brush.pen;


        this._scene = scene;
        this._pointerNode = new Vector3(0, 0, 0);
    }

    /**
     * Gets the keyboard observable for the current canvas
     */
    public get onKeyboardObservable(): Observable<KeyboardInfo> {
        return this._scene.onKeyboardObservable;
    }

    /**
     * Gets the pointer observable for the current canvas
     */
    public get onPointerObservable(): Observable<PointerInfo> {
        return this._scene.onPointerObservable;
    }

    /**
     * Starts creating a new path at the location of the pointer
     */
    public startPath(): void {
        if (this._currentPath) {
            return;
        }

        // Cleanup the redo list
        this._redoPaths.length = 0;

        // Create the new path mesh and assigns its material
        this._currentPath = this._createPath(this._scene.pointerX, this._scene.pointerY);
        this._currentPath.material = this._createPathMaterial();

        // Quick Optim
        this._currentPath.isPickable = false;
        this._currentPath.material.freeze();
        this._currentPath.alwaysSelectAsActiveMesh = true;
        this._currentPath.freezeWorldMatrix();
    }

    /**
     * Extends the path to the new pointer location
     */
    public extendPath(): void {
        if (!this._currentPath) {
            return;
        }

        // Add a new point to the path
        this._currentPath.addPointToPath(this._scene.pointerX, this._scene.pointerY);
    }

    /**
     * Ends the current path
     */
    public endPath(): void {
        if (!this._currentPath) {
            return;
        }

        // Adds the path to our undo list
        this._paths.push(this._currentPath);

        // Clear the current path
        this._currentPath = null;
    }

    /**
     * Undo the latest created path
     */
    public undo(): void {
        if (!this._currentPath && this._paths.length > 0) {
            const path = this._paths.pop();
            this._redoPaths.push(path);
            this._scene.removeMesh(path);
        }
    }

    /**
     * Redo the latest undone path
     */
    public redo(): void {
        if (!this._currentPath && this._redoPaths.length > 0) {
            const path = this._redoPaths.pop();
            this._paths.push(path);
            this._scene.addMesh(path);
        }
    }

    /**
     * Clear all the created path
     */
    public clear(): void {
        if (!this._currentPath && this._paths.length > 0) {
            let path: PathMesh;
            while (path = this._paths.pop()) {
                path.dispose();
            }
        }
    }

    /**
     * Change the size of the current brush
     */
    public changeSize(size: number): void {
        this._currentSize = size;
    }

    /**
     * Change the color of the current pen
     */
    public changeColor(color: Color3): void {
        this._currentColor = color;
        this.usePen();
    }

    /**
     * Switch to pen mode
     */
    public usePen(): void {
        this._currentMode = Brush.pen;
    }

    /**
     * Get the current framerate
     */
    public getFps(): number {
        return this._scene.getEngine().getFps();
    }

    /**
     * Toggle the Babylon almighty inspector
     */
    public toggleDebugLayer(): Promise<void> {
        // Rely on code splitting to prevent all of babylon
        // + loaders, serializers... to be downloaded if not necessary
        return import(/* webpackChunkName: "debug" */ "./debug/appDebug").then((debugModule) => {
            debugModule.toggleDebugMode(this._scene);
        });
    }

    private _updateParticleSystem(): void {
        // Update the current particle emitter
        this._pointerNode.x = this._scene.pointerX;
        this._pointerNode.y = this._scene.pointerY;
    }

    private _createParticleSystem(): ParticleSystem {
        // Create a particle system
        const particleSystem = new ParticleSystem("particles", 1500, this._scene);

        // Where the particles come from
        particleSystem.emitter = this._pointerNode; // the starting location

        // Colors of all particles
        particleSystem.color1 = new Color4(0.99, 0.99, 0.99);
        particleSystem.color2 = new Color4(1, 0.98, 0);
        particleSystem.colorDead = new Color4(0.1, 0.1, 0.1, 0.1);
    
        // Size of each particle; random between...
        particleSystem.minSize = 1;
        particleSystem.maxSize = 8;
    
        // Life time of each particle; random between...
        particleSystem.minLifeTime = 0.1;
        particleSystem.maxLifeTime = 0.2;

        // Emission rate
        particleSystem.emitRate = 5000;

        // Emission Space
        particleSystem.createSphereEmitter(this._currentSize, 0.3);
    
        // Speed
        particleSystem.minEmitPower = 70;
        particleSystem.maxEmitPower = 100;
        particleSystem.updateSpeed = 0.005;
    
        return particleSystem;
    }

    private _createPathMaterial(): Material {
        // Creates a material for the path according to our current inking
        // setup.

        if (this._debug) {
            const pathMaterial = createDebugMaterial("debugMaterial", this._scene);
            return pathMaterial;
        }
    
        if (this._currentMode === Brush.pen) {
            const pathMaterial = createSimpleMaterial("pathMaterial", this._scene, this._currentColor);
            return pathMaterial;
        }
    
        const pathMaterial = createRainbowMaterial("pathMaterial", this._scene);
        return pathMaterial;
    }

    private _createPath(x: number, y: number): PathMesh {
        // Creates a path mesh according to our current inking setup

        let options: Partial<PathBufferDataOptions> = {
            radius: this._currentSize
        }
    
        if (this._debug) {
            options.debounce = 1;
            options.roundness = 8;
        }
    
        const path = new PathMesh('path', this._scene, x, y, options);
        return path;
    }
}
