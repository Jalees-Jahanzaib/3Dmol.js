/**
 * Simplified webGL renderer
 */

$3Dmol.Renderer = function(parameters) {

    var SKIPFRAMEBUFFER = false;

    parameters = parameters || {};
    this.row = parameters.row;
    this.col = parameters.col;
    this.rows = parameters.rows;
    this.cols = parameters.cols;
    var _canvas = parameters.canvas !== undefined ? parameters.canvas
            : document.createElement('canvas'),


    _precision = parameters.precision !== undefined ? parameters.precision
            : 'highp', _alpha = parameters.alpha !== undefined ? parameters.alpha
            : true, _premultipliedAlpha = parameters.premultipliedAlpha !== undefined ? parameters.premultipliedAlpha
            : true, _antialias = parameters.antialias !== undefined ? parameters.antialias
            : false, _stencil = parameters.stencil !== undefined ? parameters.stencil
            : true, _preserveDrawingBuffer = parameters.preserveDrawingBuffer !== undefined ? parameters.preserveDrawingBuffer
            : false, _clearColor = parameters.clearColor !== undefined ? new $3Dmol.Color(
            parameters.clearColor) : new $3Dmol.Color(0x000000),
             _clearAlpha = parameters.clearAlpha !== undefined ? parameters.clearAlpha : 0, 
            _outlineMaterial = new $3Dmol.MeshOutlineMaterial(parameters.outline),
            _outlineSphereImposterMaterial = new $3Dmol.SphereImposterOutlineMaterial(parameters.outline),
            _outlineStickImposterMaterial = new $3Dmol.StickImposterOutlineMaterial(parameters.outline),
            _outlineEnabled = !!parameters.outline
            ;
    this.domElement = _canvas;    
    this.context = null;
    this.devicePixelRatio = parameters.devicePixelRatio !== undefined ? parameters.devicePixelRatio
        : (window.devicePixelRatio !== undefined) ? window.devicePixelRatio : 1;

    // clearing
    _canvas.id=parameters.id;
    this.autoClear = true;
    this.autoClearColor = true;
    this.autoClearDepth = true;
    this.autoClearStencil = true;

    // scene graph

    this.sortObjects = true;

    this.autoUpdateObjects = true;
    this.autoUpdateScene = true;

    this.renderPluginsPost = [];

    // info

    this.info = {
        memory : {

            programs : 0,
            geometries : 0,
            textures : 0

        },
        render : {

            calls : 0,
            vertices : 0,
            faces : 0,
            points : 0

        }
    };

    // internal properties
    var _this = this,
    _programs = [], _programs_counter = 0,
    
    // internal state cache
    _currentProgram = null,
    _currentMaterialId = -1, _currentGeometryGroupHash = null, _currentCamera = null, _geometryGroupCounter = 0,
      
    // GL state cache
    _oldDoubleSided = -1, _oldFlipSided = -1,
    _oldBlending = -1,
    _oldDepthTest = -1, _oldDepthWrite = -1,
    _oldPolygonOffset = null, 
    _oldLineWidth = null,

    _viewportWidth = 0, _viewportHeight = 0, _currentWidth = 0, _currentHeight = 0,
    _enabledAttributes = {},

    // camera matrices cache
    _projScreenMatrix = new $3Dmol.Matrix4(),
    _vector3 = new $3Dmol.Vector3(),

    // light arrays cache
    _direction = new $3Dmol.Vector3(),
    _lightsNeedUpdate = true,

    _lights = {
        ambient : [ 0, 0, 0 ],
        directional : {
            length : 0,
            colors : [],
            positions : []
        },
        point : {
            length : 0,
            colors : [],
            positions : [],
            distances : []
        },
        spot : {
            length : 0,
            colors : [],
            positions : [],
            distances : [],
            directions : [],
            anglesCos : [],
            exponents : []
        },
        hemi : {
            length : 0,
            skyColors : [],
            groundColors : [],
            positions : []
        }

    };

    // initialize
    var _gl;

    initGL();
    // if shared resources is not empty object, use its shared buffers, else, create new
    if (Object.getOwnPropertyNames(parameters.sharedResources).length != 0) this.offscreen = parameters.sharedResources;
    else this.offscreen = initOffScreenRender(parameters.containerWidth, parameters.containerHeight);
    setDefaultGLState();

    this.context = _gl;
    var _extInstanced = _gl.getExtension("ANGLE_instanced_arrays");
    var _extFragDepth = _gl.getExtension("EXT_frag_depth");

    // API
    
    this.supportedExtensions = function() {
        return {supportsAIA: Boolean(_extInstanced),
            supportsImposters:  Boolean(_extFragDepth) || _gl.getParameter(_gl.VERSION)[6] == "2"
            };
    };
    
    this.getContext = function() {
        return _gl;
    };

    this.getPrecision = function() {
        return _precision;
    };

    this.setClearColorHex = function(hex, alpha) {
        _clearColor.setHex(hex);
        _clearAlpha = alpha;

        _gl.clearColor(_clearColor.r, _clearColor.g, _clearColor.b,
                        _clearAlpha);
    };

    this.enableOutline = function(parameters) {
        _outlineMaterial = new $3Dmol.MeshOutlineMaterial(parameters);
        _outlineSphereImposterMaterial = new $3Dmol.SphereImposterOutlineMaterial(parameters);
        _outlineStickImposterMaterial = new $3Dmol.StickImposterOutlineMaterial(parameters);
        _outlineEnabled = true;
    };

    this.disableOutline = function() {
        _outlineEnabled = false;
    };
    this.setViewport = function(){
        if(this.rows != undefined && this.cols != undefined && this.row != undefined && this.col != undefined){

            var wid = _canvas.width/this.cols;
            var hei = _canvas.height/this.rows;
           
            _viewportWidth =  wid * this.devicePixelRatio;
            _viewportHeight = hei * this.devicePixelRatio;

             _gl.drawingBufferWidth = _viewportWidth*3;
              _gl.drawingBufferHeight = _viewportHeight;
            _gl.enable(_gl.SCISSOR_TEST);
            _gl.scissor(wid*this.col,hei * this.row, wid, hei);
            _gl.viewport(wid * this.col , hei * this.row, wid, hei);

        }
    };
    
    this.setSize = function(width, height) {
        if(this.rows != undefined && this.cols != undefined && this.row != undefined && this.col != undefined){
            var wid = width/this.cols;
            var hei = height/this.rows;
            _canvas.width =width* this.devicePixelRatio;
            _canvas.height = height*this.devicePixelRatio;

            _viewportWidth =  wid * this.devicePixelRatio;
            _viewportHeight = hei * this.devicePixelRatio;

            _canvas.style.width = width + 'px';
            _canvas.style.height = height + 'px';

            this.setViewport();
        }else{
            _viewportWidth = _canvas.width = width * this.devicePixelRatio;
            _viewportHeight =  _canvas.height = height * this.devicePixelRatio;

            _canvas.style.width = width + 'px';
            _canvas.style.height = height + 'px';

            _gl.viewport(0, 0, _gl.drawingBufferWidth, _gl.drawingBufferHeight);
        }
    };


    this.setFrameBufferSize = function(width, height){
        // this part is only needed/works with webgl2
        if (_gl.getParameter(_gl.VERSION)[6] == "1" || SKIPFRAMEBUFFER) return; 
            
        var targetTexture = _gl.createTexture();
        _gl.bindTexture(_gl.TEXTURE_2D, targetTexture);
        _gl.texImage2D(_gl.TEXTURE_2D, 0, _gl.RGBA, width * this.devicePixelRatio, 
            height * this.devicePixelRatio, 0, _gl.RGBA, _gl.UNSIGNED_BYTE, null);
        _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_MIN_FILTER, _gl.LINEAR);
        _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_MAG_FILTER, _gl.LINEAR);
        _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_WRAP_S, _gl.CLAMP_TO_EDGE);
        _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_WRAP_T, _gl.CLAMP_TO_EDGE);

        // IMP: this requires an extension in webgl1, so if 2 is not available
        // i'll have to not render to framebuffer at all and normally render to screen
        // as it will already be of no use without the volumetric renderer
        // i mean it can't be left out here that easily
        var depthTexture = _gl.createTexture();
        _gl.bindTexture(_gl.TEXTURE_2D, depthTexture);
        _gl.texImage2D(_gl.TEXTURE_2D, 0, _gl.DEPTH_COMPONENT32F, width * this.devicePixelRatio, 
            height * this.devicePixelRatio, 0, _gl.DEPTH_COMPONENT, _gl.FLOAT, null);
        _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_MIN_FILTER, _gl.NEAREST);
        _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_MAG_FILTER, _gl.NEAREST);
        _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_WRAP_S, _gl.CLAMP_TO_EDGE);
        _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_WRAP_T, _gl.CLAMP_TO_EDGE);

        // Create and bind the framebuffer
        var fb = _gl.createFramebuffer();
        _gl.bindFramebuffer(_gl.FRAMEBUFFER, fb);
        _gl.framebufferTexture2D(_gl.FRAMEBUFFER, _gl.COLOR_ATTACHMENT0, _gl.TEXTURE_2D, targetTexture, 0);
        _gl.framebufferTexture2D(_gl.FRAMEBUFFER, _gl.DEPTH_ATTACHMENT,  _gl.TEXTURE_2D, depthTexture, 0);
                
        this.offscreen.targetTexture = targetTexture;
        this.offscreen.fb = fb;
        this.offscreen.depthTexture = depthTexture;
    };

    this.clear = function(color, depth, stencil) {

        var bits = 0;
        if (color === undefined || color)
            bits |= _gl.COLOR_BUFFER_BIT;
        if (depth === undefined || depth)
            bits |= _gl.DEPTH_BUFFER_BIT;
        if (stencil === undefined || stencil)
            bits |= _gl.STENCIL_BUFFER_BIT;
        _gl.clear(bits);

    };

    this.clearTarget = function(color, depth, stencil) {

        this.clear(color, depth, stencil);

    };

    this.setMaterialFaces = function(material, reflected) {

        var doubleSided = material.side === $3Dmol.DoubleSide;
        var flipSided = material.side === $3Dmol.BackSide;
        flipSided = reflected ? !flipSided : flipSided;

        if (_oldDoubleSided !== doubleSided) {

            if (doubleSided) {

                _gl.disable(_gl.CULL_FACE);

            } else {

                _gl.enable(_gl.CULL_FACE);

            }

            _oldDoubleSided = doubleSided;

        }

        if (_oldFlipSided !== flipSided) {

            if (flipSided) {

                _gl.frontFace(_gl.CW);

            } else {

                _gl.frontFace(_gl.CCW);

            }

            _oldFlipSided = flipSided;

        }

        _gl.cullFace(_gl.BACK); 

        if (material.volumetric){
            _gl.enable(_gl.CULL_FACE);
            _gl.cullFace(_gl.FRONT);
            _gl.enable(_gl.BLEND);
            _gl.blendFunc(_gl.ONE, _gl.ONE_MINUS_SRC_ALPHA);
        }
    };

    this.setDepthTest = function(depthTest) {

        if (_oldDepthTest !== depthTest) {

            if (depthTest) {

                _gl.enable(_gl.DEPTH_TEST);

            } else {

                _gl.disable(_gl.DEPTH_TEST);

            }

            _oldDepthTest = depthTest;

        }

    };

    this.setDepthWrite = function(depthWrite) {

        if (_oldDepthWrite !== depthWrite) {

            _gl.depthMask(depthWrite);
            _oldDepthWrite = depthWrite;

        }

    };

    this.setBlending = function(blending) {

        if (!blending) {
            _gl.disable(_gl.BLEND);

        } else {
            _gl.enable(_gl.BLEND);
            _gl.blendEquationSeparate(_gl.FUNC_ADD, _gl.FUNC_ADD);
            _gl.blendFuncSeparate(_gl.SRC_ALPHA, _gl.ONE_MINUS_SRC_ALPHA,
                    _gl.ONE, _gl.ONE_MINUS_SRC_ALPHA);

        }

        _oldBlending = blending;
    };

    // Plugins

    this.addPostPlugin = function(plugin) {

        plugin.init(this);
        this.renderPluginsPost.push(plugin);

    };

    function enableAttribute(attribute) {

        if (!_enabledAttributes[attribute]) {

            _gl.enableVertexAttribArray(attribute);
            _enabledAttributes[attribute] = true;

        }

    }

    function disableAttributes() {

        for ( var attribute in _enabledAttributes) {

            if (_enabledAttributes[attribute]) {

                _gl.disableVertexAttribArray(attribute);
                _enabledAttributes[attribute] = false;

            }

        }

    }

    function setPolygonOffset(polygonOffset) {

        if (_oldPolygonOffset !== polygonOffset) {

            if (polygonOffset)
                _gl.enable(_gl.POLYGON_OFFSET_FILL);
            else
                _gl.disable(_gl.POLYGON_OFFSET_FILL);
        }
    }

    function setLineWidth(width) {

        if (width !== _oldLineWidth) {
            _gl.lineWidth(width);
            _oldLineWidth = width;
        }

    }
    
    var deallocateGeometry = function(geometry) {

        geometry.__webglInit = undefined;

        if (geometry.__webglVertexBuffer !== undefined)
            _gl.deleteBuffer(geometry.__webglVertexBuffer);

        if (geometry.__webglColorBuffer !== undefined)
            _gl.deleteBuffer(geometry.__webglColorBuffer);

        if (geometry.geometryGroups !== undefined) {

            for (var g = 0, gl = geometry.groups; g < gl; g++) {

                var geometryGroup = geometry.geometryGroups[g];

                if (geometryGroup.__webglVertexBuffer !== undefined)
                    _gl.deleteBuffer(geometryGroup.__webglVertexBuffer);

                if (geometryGroup.__webglColorBuffer !== undefined)
                    _gl.deleteBuffer(geometryGroup.__webglColorBuffer);

                if (geometryGroup.__webglNormalBuffer !== undefined)
                    _gl.deleteBuffer(geometryGroup.__webglNormalBuffer);

                if (geometryGroup.__webglFaceBuffer !== undefined)
                    _gl.deleteBuffer(geometryGroup.__webglFaceBuffer);

                if (geometryGroup.__webglLineBuffer !== undefined)
                    _gl.deleteBuffer(geometryGroup.__webglLineBuffer);

            }
        }
    };

    var deallocateMaterial = function(material) {

        var program = material.program;

        if (program === undefined)
            return;

        material.program = undefined;

        // only deallocate GL program if this was the last use of shared program
        // assumed there is only single copy of any program in the _programs
        // list
        // (that's how it's constructed)

        var i, il, programInfo;
        var deleteProgram = false;

        for (i = 0, il = _programs.length; i < il; i++) {

            programInfo = _programs[i];

            if (programInfo.program === program) {

                programInfo.usedTimes--;

                if (programInfo.usedTimes === 0) {

                    deleteProgram = true;

                }

                break;

            }

        }

        if (deleteProgram === true) {

            // avoid using array.splice, this is costlier than creating new
            // array from scratch

            var newPrograms = [];

            for (i = 0, il = _programs.length; i < il; i++) {

                programInfo = _programs[i];

                if (programInfo.program !== program) {

                    newPrograms.push(programInfo);

                }

            }

            _programs = newPrograms;

            _gl.deleteProgram(program);

            _this.info.memory.programs--;

        }

    };

    var deallocateTexture = function(texture) {

        if (texture.image && texture.image.__webglTextureCube) {

            // cube texture

            _gl.deleteTexture(texture.image.__webglTextureCube);

        }

        else {

            // 2D texture

            if (!texture.__webglInit)
                return;

            texture.__webglInit = false;
            _gl.deleteTexture(texture.__webglTexture);

        }

    };
    

    var onGeometryDispose = function(event) {

        var geometry = event.target;
        geometry.removeEventListener('dispose', onGeometryDispose);

        deallocateGeometry(geometry);

        _this.info.memory.geometries--;

    };

    var onTextureDispose = function(event) {

        var texture = event.target;

        texture.removeEventListener('dispose', onTextureDispose);

        deallocateTexture(texture);

        _this.info.memory.textures--;

    };

    var onMaterialDispose = function(event) {

        var material = event.target;
        material.removeEventListener('dispose', onMaterialDispose);

        deallocateMaterial(material);

    };

    // Compile and return shader
    function getShader(type, str) {

        var shader;

        if(_gl.getParameter(_gl.VERSION)[6] == "2" && !str.startsWith("#version")) {
            //convert webgl1 to webgl2, unless a version is already explicit
            str = str.replace(/gl_FragDepthEXT/g,"gl_FragDepth");
            if(type == "fragment") {
                str = str.replace(/varying/g,"in");
            } else {
                str = str.replace(/varying/g,"out");
            }
            str = str.replace(/attribute/g,"in");
            str = str.replace(/texture2D/g,"texture");
            str = str.replace(/\/\/DEFINEFRAGCOLOR/g,'out vec4 glFragColor;');
            str = str.replace(/gl_FragColor/g,"glFragColor");
            str = "#version 300 es\n"+str;            
        }
        if (type === "fragment")
            shader = _gl.createShader(_gl.FRAGMENT_SHADER);
        else if (type === "vertex")
            shader = _gl.createShader(_gl.VERTEX_SHADER);

        _gl.shaderSource(shader, str);
        _gl.compileShader(shader);

        if (!_gl.getShaderParameter(shader, _gl.COMPILE_STATUS)) {

            console.error(_gl.getShaderInfoLog(shader));
            console.error("could not initialize shader");
            return null;

        }

        return shader;

    }

    // Compile appropriate shaders (if necessary) from source code and attach to
    // gl program.
    function buildProgram(fragmentShader, vertexShader, uniforms, parameters) {

        var p, pl, program, code;
        var chunks = [];

        chunks.push(fragmentShader);
        chunks.push(vertexShader);

        for (p in parameters) {
            chunks.push(p);
            chunks.push(parameters[p]);
        }

        code = chunks.join();

        // check if program has already been compiled

        for (p = 0, pl = _programs.length; p < pl; p++) {

            var programInfo = _programs[p];

            if (programInfo.code === code) {

                programInfo.usedTimes++;

                return programInfo.program;
            }
        }

        // check if program requires webgl2
        if (_gl.getParameter(_gl.VERSION)[6] != "2"){
            if (parameters.volumetric) 
                throw new Error("Volumetric rendering requires webgl2 which is not supported by your hardware.");
        }


        // Set up new program and compile shaders

        program = _gl.createProgram();

        // set up precision
        var precision = _precision;
        var prefix = "precision " + precision + " float;";

        var prefix_vertex = [ 
                parameters.volumetric ? "#version 300 es" : "", prefix ]
                .join("\n");

        var prefix_fragment = [
                parameters.volumetric ? "#version 300 es" : "",
                parameters.fragdepth &&_gl.getParameter(_gl.VERSION)[6] == "1" ? "#extension GL_EXT_frag_depth: enable"
                        : "",
                parameters.wireframe ? "#define WIREFRAME 1" : "", prefix ]
                .join("\n");

        var glFragmentShader = getShader("fragment", prefix_fragment
                + fragmentShader);
        var glVertexShader = getShader("vertex", prefix_vertex + vertexShader);

        _gl.attachShader(program, glVertexShader);
        _gl.attachShader(program, glFragmentShader);

        _gl.linkProgram(program);

        if (!_gl.getProgramParameter(program, _gl.LINK_STATUS))
            console.error("Could not initialize shader");

        // gather and cache uniform variables and attributes

        program.uniforms = {};
        program.attributes = {};

        var identifiers, u, i;

        // uniform vars
        identifiers = [ 'viewMatrix', 'modelViewMatrix', 'projectionMatrix', 
                'normalMatrix'];

        // custom uniform vars
        for (u in uniforms)
            identifiers.push(u);

        for (i = 0; i < identifiers.length; i++) {

            var uniformVar = identifiers[i];
            program.uniforms[uniformVar] = _gl.getUniformLocation(program,
                    uniformVar);

        }

        // attributes
        identifiers = [ 'position', 'normal', 'color', 'lineDistance',
                'offset', 'radius' ];

        /*
         * for (a in attributes) identifiers.push(a);
         */

        for (i = 0; i < identifiers.length; i++) {

            var attributeVar = identifiers[i];
            program.attributes[attributeVar] = _gl.getAttribLocation(program,
                    attributeVar);
        }

        program.id = _programs_counter++;
        _programs.push({
            program : program,
            code : code,
            usedTimes : 1
        });
        _this.info.memory.programs = _programs.length;

        return program;
    }

    // TODO: need to set up shader attributes and uniforms as attributes on
    // material object after attaching prgm
    // We need to attach appropriate uniform variables to material after shaders
    // have been chosen
    this.initMaterial = function(material) {

        material.addEventListener('dispose', onMaterialDispose);

        var parameters, shaderID;

        shaderID = material.shaderID;

        if (shaderID) {

            var shader = $3Dmol.ShaderLib[shaderID];
            material.vertexShader = shader.vertexShader;
            material.fragmentShader = shader.fragmentShader;
            material.uniforms = $3Dmol.ShaderUtils.clone(shader.uniforms);
            // TODO: set material uniforms to shader uniform variables

        }

        parameters = {
            wireframe : material.wireframe,
            fragdepth : material.imposter,
            volumetric : material.volumetric
        };

        material.program = buildProgram(material.fragmentShader,
                material.vertexShader, material.uniforms, parameters);

    };

    function setProgram(camera, lights, fog, material, object, renderer) {

        if (material.needsUpdate) {

            if (material.program)
                deallocateMaterial(material);

            _this.initMaterial(material, lights, fog, object);
            material.needsUpdate = false;
        }

        var refreshMaterial = false;

        // p_uniforms: uniformVarName => uniformLocation
        // m_uniforms: uniformVarName => uniformJsVal
        var program = material.program, p_uniforms = program.uniforms, m_uniforms = material.uniforms;

        if (program != _currentProgram) {
            _gl.useProgram(program);
            _currentProgram = program;

            refreshMaterial = true;
        }

        if (material.id != _currentMaterialId) {
            _currentMaterialId = material.id;
            refreshMaterial = true;
        }

        if (camera != _currentCamera) {
            _currentCamera = camera;
            refreshMaterial = true;
        }

        _gl.uniformMatrix4fv(p_uniforms.projectionMatrix, false,
                camera.projectionMatrix.elements);
        _gl.uniformMatrix4fv(p_uniforms.modelViewMatrix, false,
                object._modelViewMatrix.elements);
        _gl.uniformMatrix3fv(p_uniforms.normalMatrix, false,
                object._normalMatrix.elements);

        // Send projection matrix to uniform variable in shader
        if (refreshMaterial) {

            // Load projection, model-view matrices for perspective

            // Set up correct fog uniform vals
            m_uniforms.fogColor.value = fog.color;
            m_uniforms.fogNear.value = fog.near;
            m_uniforms.fogFar.value = fog.far;

            // Set up lights for lambert shader
            if (material.shaderID.startsWith("lambert")
                    || material.shaderID === "instanced"
                    || material.shaderID.endsWith("imposter")) {

                // load view and normal matrices for directional and object
                // lighting
                _gl.uniformMatrix4fv(p_uniforms.viewMatrix, false,
                        camera.matrixWorldInverse.elements);

                if (_lightsNeedUpdate) {
                    setupLights(program, lights);
                    _lightsNeedUpdate = false;
                }

                // Set up correct light uniform var vals
                m_uniforms.directionalLightColor.value = _lights.directional.colors;
                m_uniforms.directionalLightDirection.value = _lights.directional.positions;

            } else if (material.shaderID.endsWith("outline")) {
                m_uniforms.outlineColor.value = material.outlineColor;
                m_uniforms.outlineWidth.value = material.outlineWidth;
                m_uniforms.outlinePushback.value = material.outlinePushback;
            } else if (material.shaderID === "sphereimposter") {
                _gl.uniformMatrix4fv(p_uniforms.viewMatrix, false,
                        camera.matrixWorldInverse.elements);
                _gl.uniformMatrix3fv(p_uniforms.normalMatrix, false,
                        object._normalMatrix.elements);
                m_uniforms.directionalLightColor.value = _lights.directional.colors;
                m_uniforms.directionalLightDirection.value = _lights.directional.positions;
            } else if (material.shaderID === "volumetric") {
                _gl.uniformMatrix4fv(p_uniforms.viewMatrix, false, camera.matrixWorldInverse.elements);
                p_uniforms.eye_pos = _gl.getUniformLocation(program, "eye_pos");
                _gl.uniform3fv(p_uniforms.eye_pos, Object.values(camera.position));
                p_uniforms.modelMatrix = _gl.getUniformLocation(program, "modelMatrix");
                _gl.uniformMatrix4fv(p_uniforms.modelMatrix, false, object.matrixWorld.elements);
                p_uniforms.modelPos = _gl.getUniformLocation(program, "modelPos");
                // hack to get box position because position is always 0,0,0 (box vertices are initialiez to their final position)
                _gl.uniform3fv(p_uniforms.modelPos, object.geometry.geometryGroups[0].vertexArray.slice(0, 3));
                // inverse model matrix (with unit scale, so as to not scale the eye_pos)
                p_uniforms.modelMatrixInverse = _gl.getUniformLocation(program, "modelMatrixInverse");
                _gl.uniformMatrix4fv(p_uniforms.modelMatrixInverse, false, object.matrix.getInverse(object.matrixWorld).elements);
                // scale stuff
                var longestAxis = Math.max(material.map.image.size.x, Math.max(material.map.image.size.y, material.map.image.size.z));
                var volScale = [material.map.image.size.x / longestAxis, material.map.image.size.y / longestAxis, material.map.image.size.z / longestAxis];
                // if volData has matrix, then it overrides size and unit scale, and translation is separate anyway
                var volDims;
                if (material.map.image.matrix){
                    var scaleX = Math.sqrt(Math.pow(material.map.image.matrix.elements[0], 2) + Math.pow(material.map.image.matrix.elements[4], 2) + Math.pow(material.map.image.matrix.elements[8], 2) );
                    var scaleY = Math.sqrt(Math.pow(material.map.image.matrix.elements[1], 2) + Math.pow(material.map.image.matrix.elements[5], 2) + Math.pow(material.map.image.matrix.elements[9], 2) );
                    var scaleZ = Math.sqrt(Math.pow(material.map.image.matrix.elements[2], 2) + Math.pow(material.map.image.matrix.elements[6], 2) + Math.pow(material.map.image.matrix.elements[10], 2) ); 
                    volDims = [material.map.image.size.x * scaleX, 
                        material.map.image.size.y * scaleY, 
                        material.map.image.size.z * scaleZ]; 
                    // ccp4 have a property that can change the dimensions order  
                    if (material.map.image.dimensionorder)
                        volDims = [volDims[material.map.image.dimensionorder[0]-1], volDims[material.map.image.dimensionorder[1]-1], volDims[material.map.image.dimensionorder[2]-1]];
                } else {
                    volDims = [material.map.image.size.x * material.map.image.unit.x, 
                        material.map.image.size.y * material.map.image.unit.y, 
                        material.map.image.size.z * material.map.image.unit.z];
                }
                p_uniforms.volScale = _gl.getUniformLocation(program, "volume_scale");
                _gl.uniform3fv(p_uniforms.volScale, volScale);
                p_uniforms.volDims = _gl.getUniformLocation(program, "volume_dims");
                _gl.uniform3fv(p_uniforms.volDims, volDims);
                _gl.uniform2fv(_gl.getUniformLocation(program, "screenCoords"), [_gl.canvas.width, _gl.canvas.height]);
                _gl.uniform1f(_gl.getUniformLocation(program, "cameraNear"), camera.near);
                _gl.uniform1f(_gl.getUniformLocation(program, "cameraFar"), camera.far);

                renderer.setTexture(object.material.transferfn, 4, false);
                renderer.setTexture(object.material.map, 3, true);

                // depth texture from the renderbuffer, for volumetric integration with surfaces
                _gl.activeTexture(_gl.TEXTURE5);
                _gl.bindTexture(_gl.TEXTURE_2D, renderer.offscreen.depthTexture);
            }

            // opacity, diffuse, emissive, etc
            m_uniforms.opacity.value = material.opacity;

            // Load any other material specific uniform variables to gl shaders
            loadMaterialUniforms(p_uniforms, m_uniforms);

        }

        return program;

    }

    function loadMaterialUniforms(p_uniforms, m_uniforms) {
        var uniformVar, type, uniformVal, uniformLoc;

        for (uniformVar in m_uniforms) {
            if (!p_uniforms[uniformVar])
                continue;

            type = m_uniforms[uniformVar].type;
            uniformVal = m_uniforms[uniformVar].value;
            uniformLoc = p_uniforms[uniformVar];

            // single float
            if (type === 'f')
                _gl.uniform1f(uniformLoc, uniformVal);
            // single integer
            else if (type === 'i')
                _gl.uniform1i(uniformLoc, uniformVal);
            // array of floats
            else if (type === 'fv')
                _gl.uniform3fv(uniformLoc, uniformVal);
            // color - r,g,b floats
            else if (type === 'c')
                _gl.uniform3f(uniformLoc, uniformVal.r, uniformVal.g,
                        uniformVal.b);
            else if (type === 'f4')
                _gl.uniform4f(uniformLoc, uniformVal[0], uniformVal[1],
                        uniformVal[2],uniformVal[3]);

        }

    }

    this.renderBuffer = function(camera, lights, fog, material, geometryGroup,
            object) {

        if (!material.visible)
            return;

        var program, attributes;

        // Sets up proper vertex and fragment shaders and attaches them to webGL
        // program
        // Also sets appropriate uniform variables
        program = setProgram(camera, lights, fog, material, object, this);

        attributes = program.attributes;

        var updateBuffers = false, wireframeBit = material.wireframe ? 1 : 0, geometryGroupHash = (geometryGroup.id * 0xffffff)
                + (program.id * 2) + wireframeBit;

        if (geometryGroupHash !== _currentGeometryGroupHash) {
            _currentGeometryGroupHash = geometryGroupHash;
            updateBuffers = true;
        }

        // rebind shader attributes to appropriate (and already initialized) gl
        // buffers
        if (updateBuffers) {

            disableAttributes();

            // Vertices
            if (attributes.position >= 0) {
                _gl.bindBuffer(_gl.ARRAY_BUFFER,
                        geometryGroup.__webglVertexBuffer);
                enableAttribute(attributes.position);
                _gl.vertexAttribPointer(attributes.position, 3, _gl.FLOAT,
                        false, 0, 0);
            }

            // Colors
            if (attributes.color >= 0) {
                _gl.bindBuffer(_gl.ARRAY_BUFFER,
                        geometryGroup.__webglColorBuffer);
                enableAttribute(attributes.color);
                _gl.vertexAttribPointer(attributes.color, 3, _gl.FLOAT, false,
                        0, 0);
            }

            // Normals
            if (attributes.normal >= 0) {
                _gl.bindBuffer(_gl.ARRAY_BUFFER,
                        geometryGroup.__webglNormalBuffer);
                enableAttribute(attributes.normal);
                _gl.vertexAttribPointer(attributes.normal, 3, _gl.FLOAT, false,
                        0, 0);
            }

            // Offsets (Instanced only)
            if (attributes.offset >= 0) {
                _gl.bindBuffer(_gl.ARRAY_BUFFER,
                        geometryGroup.__webglOffsetBuffer);
                enableAttribute(attributes.offset);
                _gl.vertexAttribPointer(attributes.offset, 3, _gl.FLOAT, false,
                        0, 0);
            }

            // Radii (Instanced only)
            if (attributes.radius >= 0) {
                _gl.bindBuffer(_gl.ARRAY_BUFFER,
                        geometryGroup.__webglRadiusBuffer);
                enableAttribute(attributes.radius);
                _gl.vertexAttribPointer(attributes.radius, 1, _gl.FLOAT, false,
                        0, 0);
            }

        }

        // Render
        var faceCount, lineCount;
        // lambert shaders - draw triangles
        // TODO: make sure geometryGroup's face count is setup correctly
        if (object instanceof $3Dmol.Mesh) {

            if (material.shaderID === "instanced") {
                var sphereGeometryGroup = material.sphere.geometryGroups[0];
                if (updateBuffers) {
                    _gl.bindBuffer(_gl.ARRAY_BUFFER,
                            geometryGroup.__webglVertexBuffer);
                    _gl.bufferData(_gl.ARRAY_BUFFER,
                            sphereGeometryGroup.vertexArray, _gl.STATIC_DRAW);
                    _gl.bindBuffer(_gl.ARRAY_BUFFER,
                            geometryGroup.__webglNormalBuffer);
                    _gl.bufferData(_gl.ARRAY_BUFFER,
                            sphereGeometryGroup.normalArray, _gl.STATIC_DRAW);
                    _gl.bindBuffer(_gl.ELEMENT_ARRAY_BUFFER,
                            geometryGroup.__webglFaceBuffer);
                    _gl.bufferData(_gl.ELEMENT_ARRAY_BUFFER,
                            sphereGeometryGroup.faceArray, _gl.STATIC_DRAW);
                }

                faceCount = sphereGeometryGroup.faceidx;

                _extInstanced.vertexAttribDivisorANGLE(attributes.offset, 1);
                _extInstanced.vertexAttribDivisorANGLE(attributes.radius, 1);
                _extInstanced.vertexAttribDivisorANGLE(attributes.color, 1);

                _extInstanced.drawElementsInstancedANGLE(_gl.TRIANGLES,
                        faceCount, _gl.UNSIGNED_SHORT, 0,
                        geometryGroup.radiusArray.length);

                _extInstanced.vertexAttribDivisorANGLE(attributes.offset, 0);
                _extInstanced.vertexAttribDivisorANGLE(attributes.radius, 0);
                _extInstanced.vertexAttribDivisorANGLE(attributes.color, 0);

            }

            else if (material.wireframe) {
                lineCount = geometryGroup.lineidx;
                setLineWidth(material.wireframeLinewidth);

                if (updateBuffers)
                    _gl.bindBuffer(_gl.ELEMENT_ARRAY_BUFFER,
                            geometryGroup.__webglLineBuffer);

                _gl.drawElements(_gl.LINES, lineCount, _gl.UNSIGNED_SHORT, 0);
            }

            else {
                faceCount = geometryGroup.faceidx;

                if (updateBuffers)
                    _gl.bindBuffer(_gl.ELEMENT_ARRAY_BUFFER,
                            geometryGroup.__webglFaceBuffer);
                _gl.drawElements(_gl.TRIANGLES, faceCount, _gl.UNSIGNED_SHORT,
                        0);

            }

            _this.info.render.calls++;
            _this.info.render.vertices += faceCount;
            _this.info.render.faces += faceCount / 3;
        }

        // basic shaders - draw lines
        else if (object instanceof $3Dmol.Line) {
            lineCount = geometryGroup.vertices;

            setLineWidth(material.linewidth);
            _gl.drawArrays(_gl.LINES, 0, lineCount);

            _this.info.render.calls++;
        }

    };

    // rendering
    function renderObjects(renderList, reverse, materialType, camera, lights,
            fog, useBlending) {

        var webglObject, object, buffer, material, start, end, delta;

        // Forward or backward render

        if (reverse) {
            start = renderList.length - 1;
            end = -1;
            delta = -1;
        }

        else {
            start = 0;
            end = renderList.length;
            delta = 1;
        }

        for (var i = start; i !== end; i += delta) {

            webglObject = renderList[i];

            if (webglObject.render) {

                object = webglObject.object;
                buffer = webglObject.buffer;
                material = webglObject[materialType];

                if (!material)
                    continue;

                if (useBlending)
                    _this.setBlending(true);

                _this.setDepthTest(material.depthTest);
                _this.setDepthWrite(material.depthWrite);
                setPolygonOffset(material.polygonOffset,
                        material.polygonOffsetFactor,
                        material.polygonOffsetUnits);

                var reflected = object._modelViewMatrix.isReflected();

                _this.setMaterialFaces(material, reflected);

                _this.renderBuffer(camera, lights, fog, material, buffer,
                        object);
                if (_outlineEnabled || material.outline) {                  
                    if(material.shaderID == 'sphereimposter') {
                        _this.renderBuffer(camera, lights, fog, _outlineSphereImposterMaterial,
                                buffer, object);                        
                    }
                    else if(material.shaderID == 'stickimposter') {
                        _this.renderBuffer(camera, lights, fog, _outlineStickImposterMaterial,
                                buffer, object);                        
                    }
                    else if(!material.wireframe                
                        && material.shaderID !== 'basic'
                        && material.opacity !== 0.0) {
                        _this.renderBuffer(camera, lights, fog, _outlineMaterial,
                            buffer, object);
                    }
                }
            }
        }

    }

    this.render = function(scene, camera, forceClear) {

        if (camera instanceof $3Dmol.Camera === false) {

            console
                    .error('$3Dmol.Renderer.render: camera is not an instance of $3Dmol.Camera.');
            return;

        }

        var i, il,

        webglObject, object, renderList,

        lights = scene.__lights, fog = scene.fog;

        // reset caching for this frame

        _currentMaterialId = -1;
        _lightsNeedUpdate = true;

        // update scene graph

        if (this.autoUpdateScene)
            scene.updateMatrixWorld();

        // update camera matrices
        // Pretty sure camera's parent is always going to be undefined for our
        // purposes...
        if (camera.parent === undefined)
            camera.updateMatrixWorld();

        camera.matrixWorldInverse.getInverse(camera.matrixWorld);

        _projScreenMatrix.multiplyMatrices(camera.projectionMatrix,
                camera.matrixWorldInverse);

        // update WebGL objects

        if (this.autoUpdateObjects)
            this.initWebGLObjects(scene);

        _this.info.render.calls = 0;
        _this.info.render.vertices = 0;
        _this.info.render.faces = 0;
        _this.info.render.points = 0;

        _currentWidth = _viewportWidth;
        _currentHeight = _viewportHeight;
        this.setViewport();
        if (this.autoClear || forceClear) {
            _gl.clearColor(_clearColor.r, _clearColor.g, _clearColor.b,
                _clearAlpha);
            this.clear(this.autoClearColor, this.autoClearDepth,
                    this.autoClearStencil);

        }

        // set matrices for regular objects (frustum culled)

        renderList = scene.__webglObjects;

        for (i = 0, il = renderList.length; i < il; i++) {

            webglObject = renderList[i];
            object = webglObject.object;

            webglObject.render = false;

            if (object.visible) {
                setupMatrices(object, camera);
                unrollBufferMaterial(webglObject);
                webglObject.render = true;
            }
        }

        // set matrices for immediate objects

        var material = null;

        // opaque pass (front-to-back order)

        this.setBlending(false);

        renderObjects(scene.__webglObjects, true, "opaque", camera, lights,
                fog, false, material);

        // prime depth buffer
        renderObjects(scene.__webglObjects, true, "blank", camera, lights, fog,
                true, material);

        // transparent pass (back-to-front order)

        renderObjects(scene.__webglObjects, false, "transparent", camera,
                lights, fog, true, material);

        // Render plugins (e.g. sprites), and reset state

        renderPlugins(this.renderPluginsPost, scene, camera);

        // Ensure depth buffer writing is enabled so it can be cleared on next
        // render

        this.renderFrameBuffertoScreen();

        this.setDepthTest(true);
        this.setDepthWrite(true);
        // _gl.finish();

    };

    function renderPlugins(plugins, scene, camera) {

        // Reset state once regardless
        // This should also fix cartoon render bug (after transparent surface
        // render)

        _currentGeometryGroupHash = -1;
        _currentProgram = null;
        _currentCamera = null;
        _oldBlending = -1;
        _oldDepthWrite = -1;
        _oldDepthTest = -1;
        _oldDoubleSided = -1;
        _currentMaterialId = -1;
        _oldFlipSided = -1;

        if (!plugins.length)
            return;

        for (var i = 0, il = plugins.length; i < il; i++) {

            _lightsNeedUpdate = true;

            plugins[i].render(scene, camera, _currentWidth, _currentHeight);

            // Reset state after plugin render
            _currentGeometryGroupHash = -1;
            _currentProgram = null;
            _currentCamera = null;
            _oldBlending = -1;
            _oldDepthWrite = -1;
            _oldDepthTest = -1;
            _oldDoubleSided = -1;
            _currentMaterialId = -1;
            _oldFlipSided = -1;

        }

    }

    this.renderFrameBuffertoScreen = function(){
        // only needed/works with webgl2
        if (_gl.getParameter(_gl.VERSION)[6] == "1" || SKIPFRAMEBUFFER) return; 

        // bind default framebuffer
        _gl.bindFramebuffer(_gl.FRAMEBUFFER, null);
        _gl.clear(_gl.COLOR_BUFFER_BIT | _gl.DEPTH_BUFFER_BIT);
        _gl.frontFace(_gl.CCW);
        _gl.cullFace(_gl.BACK);

        // set screen shader and use it
        _gl.useProgram(this.offscreen.screenshader);
        _currentProgram = this.offscreen.screenshader;
        _gl.uniform2fv(_gl.getUniformLocation(_currentProgram, "dimensions"), 
            [_gl.canvas.width, _gl.canvas.height]);

        // disable depth test
        this.setDepthTest(-1);
        this.setDepthWrite(-1);

        // bind vertexarray buffer and texture
        _gl.bindBuffer(_gl.ARRAY_BUFFER, this.offscreen.screenQuadVBO);
        _gl.enableVertexAttribArray(this.offscreen.vertexattribpos);
        _gl.vertexAttribPointer(this.offscreen.vertexattribpos, 2, _gl.FLOAT, false, 0, 0);

        _gl.disable(_gl.SCISSOR_TEST);
        _gl.viewport(0 , 0, _gl.canvas.width, _gl.canvas.height);

        _gl.activeTexture(_gl.TEXTURE0);
        _gl.bindTexture(_gl.TEXTURE_2D, this.offscreen.targetTexture);

        // Draw 6 vertexes => 2 triangles:
        _gl.drawArrays(_gl.TRIANGLES, 0, 6);

        // then set the offscreenframebuffer again here!?
        _gl.bindFramebuffer(_gl.FRAMEBUFFER, this.offscreen.fb);
    };

    this.initWebGLObjects = function(scene) {

        if (!scene.__webglObjects) {

            scene.__webglObjects = [];
            scene.__webglObjectsImmediate = [];
            scene.__webglSprites = [];
            scene.__webglFlares = [];

        }

        // Add objects; this sets up buffers for each geometryGroup
        if (scene.__objectsAdded.length) {

            while (scene.__objectsAdded.length) {
                addObject(scene.__objectsAdded[0], scene);
                scene.__objectsAdded.splice(0, 1);
            }

            // Force buffer update during render
            // Hackish fix for initial cartoon-render-then-transparent-surface
            // bug
            _currentGeometryGroupHash = -1;

        }

        while (scene.__objectsRemoved.length) {

            removeObject(scene.__objectsRemoved[0], scene);
            scene.__objectsRemoved.splice(0, 1);

        }

        // update must be called after objects adding / removal
        // This sends typed arrays to GL buffers for each geometryGroup
        for (var o = 0, ol = scene.__webglObjects.length; o < ol; o++) {

            updateObject(scene.__webglObjects[o].object);

        }

    };

    // Objects adding

    function addObject(object, scene) {

        var g, gl, geometry, material, geometryGroup;

        if (!object.__webglInit) {

            object.__webglInit = true;

            object._modelViewMatrix = new $3Dmol.Matrix4();
            object._normalMatrix = new $3Dmol.Matrix3();

            if (object.geometry !== undefined
                    && object.geometry.__webglInit === undefined) {

                object.geometry.__webglInit = true;
                object.geometry.addEventListener('dispose', onGeometryDispose);

            }

            if (object instanceof $3Dmol.Mesh || object instanceof $3Dmol.Line) {
                geometry = object.geometry;
                material = object.material;

                for (g = 0, gl = geometry.geometryGroups.length; g < gl; g++) {

                    geometryGroup = geometry.geometryGroups[g];

                    geometryGroup.id = _geometryGroupCounter++;

                    // initialise VBO on the first access

                    if (!geometryGroup.__webglVertexBuffer) {

                        if (object instanceof $3Dmol.Mesh) {
                            createMeshBuffers(geometryGroup);
                            geometry.elementsNeedUpdate = true;
                            geometry.normalsNeedUpdate = true;
                        }

                        else if (object instanceof $3Dmol.Line)
                            createLineBuffers(geometryGroup);

                        geometry.verticesNeedUpdate = true;
                        geometry.colorsNeedUpdate = true;

                    }

                }

            }

        }

        if (!object.__webglActive) {

            if (object instanceof $3Dmol.Mesh || object instanceof $3Dmol.Line) {

                geometry = object.geometry;

                for (g = 0, gl = geometry.geometryGroups.length; g < gl; g++) {
                    geometryGroup = geometry.geometryGroups[g];

                    addBuffer(scene.__webglObjects, geometryGroup, object);
                }

            }

            // Sprite
            else if (object instanceof $3Dmol.Sprite)
                scene.__webglSprites.push(object);

            object.__webglActive = true;

        }

    }

    function updateObject(object) {

        var geometry = object.geometry, geometryGroup;

        if (object instanceof $3Dmol.Mesh || object instanceof $3Dmol.Line) {

            for (var g = 0, gl = geometry.geometryGroups.length; g < gl; g++) {

                geometryGroup = geometry.geometryGroups[g];

                if (geometry.verticesNeedUpdate || geometry.elementsNeedUpdate
                        || geometry.colorsNeedUpdate
                        || geometry.normalsNeedUpdate) {
                    setBuffers(geometryGroup, _gl.STATIC_DRAW);
                }
            }

            geometry.verticesNeedUpdate = false;
            geometry.elementsNeedUpdate = false;
            geometry.normalsNeedUpdate = false;
            geometry.colorsNeedUpdate = false;

            geometry.buffersNeedUpdate = false;

        }

    }

    function removeObject(object, scene) {

        if (object instanceof $3Dmol.Mesh || object instanceof $3Dmol.Line)
            removeInstances(scene.__webglObjects, object);

        else if (object instanceof $3Dmol.Sprite)
            removeInstancesDirect(scene.__webglSprites, object);

        object.__webglActive = false;

    }

    function removeInstances(objList, object) {

        for (var o = objList.length - 1; o >= 0; --o) {

            if (objList[o].object === object)
                objList.splice(o, 1);

        }
    }

    function removeInstancesDirect(objList, object) {

        for (var o = objList.length - 1; o >= 0; --o) {

            if (objList[o] === object)
                objList.splice(o, 1);

        }
    }

    function unrollBufferMaterial(globject) {

        var object = globject.object;
        var material = object.material;

        if (material.transparent) {
            globject.opaque = null;
            globject.transparent = material;
            if (!material.wireframe) {
                var blankMaterial = material.clone();
                blankMaterial.opacity = 0.0;
                globject.blank = blankMaterial;
            }
        }

        else {
            globject.opaque = material;
            globject.transparent = null;

        }

    }

    function setBuffers(geometryGroup, hint) {

        var vertexArray = geometryGroup.vertexArray;
        var colorArray = geometryGroup.colorArray;

        // offset buffers
        if (geometryGroup.__webglOffsetBuffer !== undefined ) {
            _gl.bindBuffer(_gl.ARRAY_BUFFER, geometryGroup.__webglOffsetBuffer);
            _gl.bufferData(_gl.ARRAY_BUFFER, vertexArray, hint);
        }
        else {
            //normal, non-instanced case
            _gl.bindBuffer(_gl.ARRAY_BUFFER, geometryGroup.__webglVertexBuffer);
            _gl.bufferData(_gl.ARRAY_BUFFER, vertexArray, hint);            
        }
        // color buffers
        _gl.bindBuffer(_gl.ARRAY_BUFFER, geometryGroup.__webglColorBuffer);
        _gl.bufferData(_gl.ARRAY_BUFFER, colorArray, hint);

        // normal buffers
        if (geometryGroup.normalArray
                && geometryGroup.__webglNormalBuffer !== undefined) {
            var normalArray = geometryGroup.normalArray;
            _gl.bindBuffer(_gl.ARRAY_BUFFER, geometryGroup.__webglNormalBuffer);
            _gl.bufferData(_gl.ARRAY_BUFFER, normalArray, hint);

        }



        // radius buffers
        if (geometryGroup.radiusArray
                && geometryGroup.__webglRadiusBuffer !== undefined) {
            _gl.bindBuffer(_gl.ARRAY_BUFFER, geometryGroup.__webglRadiusBuffer);
            _gl.bufferData(_gl.ARRAY_BUFFER, geometryGroup.radiusArray, hint);
        }

        // face (index) buffers
        if (geometryGroup.faceArray
                && geometryGroup.__webglFaceBuffer !== undefined) {
            var faceArray = geometryGroup.faceArray;
            _gl.bindBuffer(_gl.ELEMENT_ARRAY_BUFFER,
                    geometryGroup.__webglFaceBuffer);
            _gl.bufferData(_gl.ELEMENT_ARRAY_BUFFER, faceArray, hint);

        }

        // line (index) buffers (for wireframe)
        if (geometryGroup.lineArray
                && geometryGroup.__webglLineBuffer !== undefined) {
            var lineArray = geometryGroup.lineArray;
            _gl.bindBuffer(_gl.ELEMENT_ARRAY_BUFFER,
                    geometryGroup.__webglLineBuffer);
            _gl.bufferData(_gl.ELEMENT_ARRAY_BUFFER, lineArray, hint);
        }

    }

    // Creates appropriate gl buffers for geometry chunk
    // TODO: do we need line buffer for mesh objects?
    // Also, can we integrate this with createLineBuffers?
    function createMeshBuffers(geometryGroup) {

        if (geometryGroup.radiusArray) {
            geometryGroup.__webglRadiusBuffer = _gl.createBuffer();
        }
        if(geometryGroup.useOffset) {
            geometryGroup.__webglOffsetBuffer = _gl.createBuffer();
        }
        geometryGroup.__webglVertexBuffer = _gl.createBuffer();
        geometryGroup.__webglNormalBuffer = _gl.createBuffer();
        geometryGroup.__webglColorBuffer = _gl.createBuffer();

        geometryGroup.__webglFaceBuffer = _gl.createBuffer();
        geometryGroup.__webglLineBuffer = _gl.createBuffer();

        _this.info.memory.geometries++;
    }

    function createLineBuffers(geometry) {

        geometry.__webglVertexBuffer = _gl.createBuffer();
        geometry.__webglColorBuffer = _gl.createBuffer();

        _this.info.memory.geometries++;
    }

    function addBuffer(objlist, buffer, object) {

        objlist.push({
            buffer : buffer,
            object : object,
            opaque : null,
            transparent : null
        });

    }

    function setupMatrices(object, camera) {

        object._modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse,
                object.matrixWorld);

        object._normalMatrix.getInverse(object._modelViewMatrix);
        object._normalMatrix.transpose();

    }

    function isPowerOfTwo(value) {

        return ((value & (value - 1)) === 0 ) && value != 1;

    }

    // Fallback filters for non-power-of-2 textures

    function filterFallback() {

        return _gl.LINEAR;

    }

    function setTextureParameters(textureType, texture, isImagePowerOfTwo) {

        if (textureType == _gl.TEXTURE_2D){
            if (isImagePowerOfTwo) {

                _gl.texParameteri(textureType, _gl.TEXTURE_WRAP_S,
                        paramToGL(texture.wrapS));
                _gl.texParameteri(textureType, _gl.TEXTURE_WRAP_T,
                        paramToGL(texture.wrapT));

                _gl.texParameteri(textureType, _gl.TEXTURE_MAG_FILTER,
                        paramToGL(texture.magFilter));
                _gl.texParameteri(textureType, _gl.TEXTURE_MIN_FILTER,
                        paramToGL(texture.minFilter));

            } else {

                _gl.texParameteri(textureType, _gl.TEXTURE_WRAP_S,
                        _gl.CLAMP_TO_EDGE);
                _gl.texParameteri(textureType, _gl.TEXTURE_WRAP_T,
                        _gl.CLAMP_TO_EDGE);
                _gl.texParameteri(textureType, _gl.TEXTURE_MAG_FILTER,
                        filterFallback(texture.magFilter));
                _gl.texParameteri(textureType, _gl.TEXTURE_MIN_FILTER,
                        filterFallback(texture.minFilter));

            }
        } else { // 3Dtexture
            _gl.texParameteri(textureType, _gl.TEXTURE_WRAP_S,
                _gl.CLAMP_TO_EDGE);
            _gl.texParameteri(textureType, _gl.TEXTURE_WRAP_T,
                _gl.CLAMP_TO_EDGE);
            _gl.texParameteri(textureType, _gl.TEXTURE_WRAP_R,
                _gl.CLAMP_TO_EDGE);
            _gl.texParameteri(textureType, _gl.TEXTURE_MAG_FILTER,
                paramToGL(texture.magFilter));
            _gl.texParameteri(textureType, _gl.TEXTURE_MIN_FILTER,
                paramToGL(texture.minFilter));
        }

    }
    this.getXYRatio = function(){
       if(this.rows != undefined && this.cols != undefined && this.row != undefined && this.col != undefined){
            return [this.cols,this.rows];
       }else{
            return [1,1];
       }
    };
    
    this.getAspect = function(width,height){
        if(width == undefined || height == undefined){
            width = _canvas.width;
            height = _canvas.height;
        }
        var aspect = width/height;
        if(this.rows != undefined && this.cols != undefined && this.row != undefined && this.col != undefined){
            var wid = width/this.cols;
            var hei = height/this.rows;
            aspect = wid/hei;
        }
        return aspect;
    };

    this.setTexture = function(texture, slot, is3D) {

        if (texture.needsUpdate) {

            if (!texture.__webglInit) {

                texture.__webglInit = true;

                texture.addEventListener('dispose', onTextureDispose);

                texture.__webglTexture = _gl.createTexture();

                _this.info.memory.textures++;

            }

            _gl.activeTexture(_gl.TEXTURE0 + slot);
            var gltextureType = is3D ? _gl.TEXTURE_3D : _gl.TEXTURE_2D;
            _gl.bindTexture(gltextureType, texture.__webglTexture);
            _gl.pixelStorei(_gl.UNPACK_FLIP_Y_WEBGL, texture.flipY);
            _gl.pixelStorei(_gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, texture.premultiplyAlpha);
            _gl.pixelStorei(_gl.UNPACK_ALIGNMENT, texture.unpackAlignment);
            _gl.pixelStorei(_gl.PACK_ALIGNMENT, texture.unpackAlignment);  

            var image = texture.image, isImagePowerOfTwo = isPowerOfTwo(image.width)
                    && isPowerOfTwo(image.height), glFormat = paramToGL(texture.format), glType = paramToGL(texture.type);
                    
            if (!is3D) { 
                setTextureParameters(_gl.TEXTURE_2D, texture, isImagePowerOfTwo);
            } else {
                setTextureParameters(_gl.TEXTURE_3D, texture, isImagePowerOfTwo && false);
                _gl.texImage3D(_gl.TEXTURE_3D, 0, _gl.R32F, texture.image.size.x, texture.image.size.y, texture.image.size.z, 0, _gl.RED, _gl.FLOAT, texture.image.data);
            }
            var mipmap, mipmaps = texture.mipmaps;
            // regular Texture (image, video, canvas)

            // use manually created mipmaps if available
            // if there are no manual mipmaps
            // set 0 level mipmap and then use GL to generate other mipmap
            // levels

            if (mipmaps.length > 0 && isImagePowerOfTwo) {

                for (var i = 0, il = mipmaps.length; i < il; i++) {
                    mipmap = mipmaps[i];
                    _gl.texImage2D(_gl.TEXTURE_2D, i, glFormat, glFormat,
                            glType, mipmap);
                }

                texture.generateMipmaps = false;
            }
            else if (!is3D)
                _gl.texImage2D(_gl.TEXTURE_2D, 0, glFormat, glFormat, glType,
                        texture.image);

            if (texture.generateMipmaps && isImagePowerOfTwo)
                _gl.generateMipmap(_gl.TEXTURE_2D);

            texture.needsUpdate = false;

            if (texture.onUpdate)
                texture.onUpdate();

        } else {

            _gl.activeTexture(_gl.TEXTURE0 + slot);
            if (is3D)
                _gl.bindTexture(_gl.TEXTURE_3D, texture.__webglTexture);
            else
                _gl.bindTexture(_gl.TEXTURE_2D, texture.__webglTexture);

        }

    };

    // Map constants to WebGL constants

    function paramToGL(p) {

        if (p === $3Dmol.UnsignedByteType)
            return _gl.UNSIGNED_BYTE;
        if (p === $3Dmol.RGBAFormat)
            return _gl.RGBA;
        if (p === $3Dmol.NearestFilter)
            return _gl.NEAREST;

        return 0;

    }

    function setupLights(program, lights) {
        var l, ll, light, r = 0, g = 0, b = 0, color, intensity, distance,

        zlights = _lights,

        dirColors = zlights.directional.colors, dirPositions = zlights.directional.positions,

        dirCount = 0, dirLength = 0, dirOffset = 0;

        for (l = 0, ll = lights.length; l < ll; l++) {

            light = lights[l];

            color = light.color;
            intensity = light.intensity;
            distance = light.distance;

            if (light instanceof $3Dmol.Light) {

                dirCount++;

                _direction.getPositionFromMatrix(light.matrixWorld);
                _vector3.getPositionFromMatrix(light.target.matrixWorld);
                _direction.sub(_vector3);
                _direction.normalize();

                if (_direction.x === 0 && _direction.y === 0
                        && _direction.z === 0)
                    continue;

                dirPositions[dirOffset] = _direction.x;
                dirPositions[dirOffset + 1] = _direction.y;
                dirPositions[dirOffset + 2] = _direction.z;

                dirColors[dirOffset] = color.r * intensity;
                dirColors[dirOffset + 1] = color.g * intensity;
                dirColors[dirOffset + 2] = color.b * intensity;

                dirOffset += 3;

                dirLength++;
            }

        }

        zlights.ambient[0] = r;
        zlights.ambient[1] = g;
        zlights.ambient[2] = b;
        zlights.directional.length = dirLength;
    }

    function initGL() {

        try {
            if (!(_gl = _canvas.getContext('webgl2', {
                alpha : _alpha,
                premultipliedAlpha : _premultipliedAlpha,
                antialias : _antialias,
                stencil : _stencil,
                preserveDrawingBuffer : _preserveDrawingBuffer
            }))) {
                if (!(_gl = _canvas.getContext('experimental-webgl', {
                    alpha : _alpha,
                    premultipliedAlpha : _premultipliedAlpha,
                    antialias : _antialias,
                    stencil : _stencil,
                    preserveDrawingBuffer : _preserveDrawingBuffer
                }))) {
                    if (!(_gl = _canvas.getContext('webgl', {
                        alpha : _alpha,
                        premultipliedAlpha : _premultipliedAlpha,
                        antialias : _antialias,
                        stencil : _stencil,
                        preserveDrawingBuffer : _preserveDrawingBuffer
                    }))) {
                        throw 'Error creating WebGL context.';
                    }
                }
            }
        } catch (error) {

            console.error(error);
        }
    }

    function initOffScreenRender(width, height){
        // only needed/works with webgl2
        if (_gl.getParameter(_gl.VERSION)[6] == "1" || SKIPFRAMEBUFFER) return; 

        var targetTexture = _gl.createTexture();
        _gl.bindTexture(_gl.TEXTURE_2D, targetTexture);
        _gl.texImage2D(_gl.TEXTURE_2D, 0, _gl.RGBA, width * this.devicePixelRatio, 
            height * this.devicePixelRatio, 0, _gl.RGBA, _gl.UNSIGNED_BYTE, null);
        _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_MIN_FILTER, _gl.LINEAR);
        _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_MAG_FILTER, _gl.LINEAR);
        _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_WRAP_S, _gl.CLAMP_TO_EDGE);
        _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_WRAP_T, _gl.CLAMP_TO_EDGE);

        // IMP: this requires an extension in webgl1, so if 2 is not available
        // i'll have to not render to framebuffer at all and normally render to screen
        // as it will already be of no use without the volumetric renderer
        // i mean it can't be left out here that easily
        var depthTexture = _gl.createTexture();
        _gl.bindTexture(_gl.TEXTURE_2D, depthTexture);
        _gl.texImage2D(_gl.TEXTURE_2D, 0, _gl.DEPTH_COMPONENT32F, width * this.devicePixelRatio, 
            height * this.devicePixelRatio, 0, _gl.DEPTH_COMPONENT, _gl.FLOAT, null);
        _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_MIN_FILTER, _gl.NEAREST);
        _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_MAG_FILTER, _gl.NEAREST);
        _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_WRAP_S, _gl.CLAMP_TO_EDGE);
        _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_WRAP_T, _gl.CLAMP_TO_EDGE);

        // Create and bind the framebuffer
        var fb = _gl.createFramebuffer();
        _gl.bindFramebuffer(_gl.FRAMEBUFFER, fb);
        _gl.framebufferTexture2D(_gl.FRAMEBUFFER, _gl.COLOR_ATTACHMENT0, _gl.TEXTURE_2D, targetTexture, 0);
        _gl.framebufferTexture2D(_gl.FRAMEBUFFER, _gl.DEPTH_ATTACHMENT,  _gl.TEXTURE_2D, depthTexture, 0);
                    
        // build screenshader
        var screenshader = $3Dmol.ShaderLib.screen;
        screenshader = buildProgram(screenshader.fragmentShader,
            screenshader.vertexShader, screenshader.uniforms, {});  
        var vertexattribpos = _gl.getAttribLocation(screenshader, 'vertexPosition');
            
        // create the vertex array and attrib array for the full screenquad
        var verts = [
            // First triangle:
             1.0,  1.0,
            -1.0,  1.0,
            -1.0, -1.0,
            // Second triangle:
            -1.0, -1.0,
             1.0, -1.0,
             1.0,  1.0
        ];
        var screenQuadVBO = _gl.createBuffer();
        _gl.bindBuffer(_gl.ARRAY_BUFFER, screenQuadVBO);
        _gl.bufferData(_gl.ARRAY_BUFFER, new Float32Array(verts), _gl.STATIC_DRAW);
 
        return {
            targetTexture: targetTexture,
            fb: fb,
            depthTexture: depthTexture,
            screenshader: screenshader,
            screenQuadVBO: screenQuadVBO,
            vertexattribpos: vertexattribpos
        };
    }

    function setDefaultGLState() {

        _gl.clearColor(0, 0, 0, 1);
        _gl.clearDepth(1);
        _gl.clearStencil(0);

        _gl.enable(_gl.DEPTH_TEST);
        _gl.depthFunc(_gl.LEQUAL);

        _gl.frontFace(_gl.CCW);
        _gl.cullFace(_gl.BACK);
        _gl.enable(_gl.CULL_FACE);

        _gl.enable(_gl.BLEND);
        _gl.blendEquation(_gl.FUNC_ADD);
        _gl.blendFunc(_gl.SRC_ALPHA, _gl.ONE_MINUS_SRC_ALPHA);

        _gl.clearColor(_clearColor.r, _clearColor.g, _clearColor.b,
                        _clearAlpha);
    }

    this.addPostPlugin(new $3Dmol.SpritePlugin());

};
