import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Scene } from "@babylonjs/core/scene";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Material } from "@babylonjs/core/Materials/material";
import { PointerInfo } from "@babylonjs/core/Events/pointerEvents";
import { Nullable } from "@babylonjs/core/types";
import { KeyboardInfo } from "@babylonjs/core/Events/keyboardEvents";
import { Observable } from "@babylonjs/core/Misc/observable";

import { PathBufferDataOptions } from "./path/pathBufferData";
import { PathMesh } from "./path/pathMesh";

import { createDebugMaterial } from "./materials/debugMaterial";
import { createSimpleMaterial } from "./materials/simpleMaterial";
import { createRainbowMaterial } from "./materials/rainbowMaterial";

import { Mesh, StandardMaterial } from "@babylonjs/core";

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

    private readonly _paths: PathMesh[];
    private readonly _redoPaths: PathMesh[];

    private _currentPath: Nullable<PathMesh> = null;
    private _currentSize: number;
    private _sizeScaleFactor: number = 0.01;
    private _currentColor: Color3;
    private _currentMode: Brush;
    private _invertedWorldMatrix: Matrix;

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
        this._invertedWorldMatrix = new Matrix();

        this._scene = scene;

        //Materials
        const greyMat = new StandardMaterial("grey", scene);
        greyMat.diffuseColor = new Color3(77 / 255, 86 / 255, 92 / 255);
        greyMat.emissiveColor = new Color3(77 / 255, 86 / 255, 92 / 255);
        greyMat.specularColor = new Color3(77 / 255, 86 / 255, 92 / 255);
        
        // Create a mesh to use as a Drawing surface
        const drawingPlane = Mesh.CreatePlane("Drawing Plane 1", 5, scene, true, Mesh.DOUBLESIDE);
        drawingPlane.material = greyMat;
        drawingPlane.position = new Vector3(0, 0, 0);
        drawingPlane.rotation = new Vector3(Math.PI / 16, 0, 0);
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
    public startPath(): Boolean {
        if (this._currentPath) {
            return;
        }

        // Cleanup the redo list
        this._redoPaths.length = 0;

        const pickInfo = this._scene.pick(this._scene.pointerX, this._scene.pointerY);
        if (pickInfo?.hit) {
            // Convert pickedPoint (global) into plane space point (local) by multiplying with the inverted world matrix 
            pickInfo.pickedMesh.getWorldMatrix().invertToRef(this._invertedWorldMatrix);
            const localCoordinates = Vector3.TransformCoordinates(pickInfo.pickedPoint, this._invertedWorldMatrix);

            // Create the new path mesh and assigns its material
            this._currentPath = this._createPath(localCoordinates.x, localCoordinates.y);
            this._currentPath.material = this._createPathMaterial();

            this._currentPath.parent = pickInfo.pickedMesh;
            this._currentPath.renderingGroupId = 2;

            // Quick Optim
            this._currentPath.isPickable = false;
            this._currentPath.material.freeze();
            this._currentPath.alwaysSelectAsActiveMesh = true;
            this._currentPath.freezeWorldMatrix();
            return true;
        } 
        return false;
    }

    /**
     * Extends the path to the new pointer location
     */
    public extendPath(): Boolean {
        if (!this._currentPath) {
            return;
        }

        const pickInfo = this._scene.pick(this._scene.pointerX, this._scene.pointerY);
        if (pickInfo?.hit) {
            // Convert pickedPoint (global) into plane space point (local) by multiplying with the inverted world matrix 
            pickInfo.pickedMesh.getWorldMatrix().invertToRef(this._invertedWorldMatrix);
            const localCoordinates = Vector3.TransformCoordinates(pickInfo.pickedPoint, this._invertedWorldMatrix);
            
            // Add a new point to the path
            this._currentPath.addPointToPath(localCoordinates.x, localCoordinates.y);
            return true;
        }
        return false;
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

    public getLastIndicesAndPositions() {
        console.log("LOG:");
        console.log(this._paths[0].geometry.serializeVerticeData());
    }

    private _createPathMaterial(): Material {
        // Creates a material for the path according to our current inking
        // setup.

        if (this._debug) {
            const pathMaterial = createDebugMaterial("debugMaterial", this._scene);
            pathMaterial.backFaceCulling = false;
            return pathMaterial;
        }
    
        if (this._currentMode === Brush.pen) {
            const pathMaterial = createSimpleMaterial("pathMaterial", this._scene, this._currentColor);
            pathMaterial.backFaceCulling = false;
            return pathMaterial;
        }
    
        const pathMaterial = createRainbowMaterial("pathMaterial", this._scene);
        pathMaterial.backFaceCulling = false;
        return pathMaterial;
    }

    private _createPath(x: number, y: number): PathMesh {
        // Creates a path mesh according to our current inking setup

        let options: Partial<PathBufferDataOptions> = {
            radius: this._currentSize * this._sizeScaleFactor
        }
    
        if (this._debug) {
            options.debounce = 1;
            options.roundness = 8;
        }
    
        const path = new PathMesh('path', this._scene, x, y, options);
        return path;
    }
}
