(() => {
    'use strict';

    const configNodes = Array.from(document.querySelectorAll('.erp-image-config'));
    const configs = configNodes.map((node) => ({
        name: node.dataset.name || 'panorama',
        uri: node.dataset.uri || ''
    })).filter((item) => item.uri);
    const grid = document.getElementById('grid');
    const syncBox = document.getElementById('syncViews');
    const filterMode = document.getElementById('filterMode');
    const resetButton = document.getElementById('resetView');
    const globalStatus = document.getElementById('globalStatus');

    const DEG = Math.PI / 180;
    const RAD = 180 / Math.PI;
    const DEFAULT_STATE = Object.freeze({ yaw: 0, pitch: 0, fov: 75 });

    grid.dataset.count = String(configs.length);
    if (globalStatus) globalStatus.textContent = `${configs.length} image${configs.length === 1 ? '' : 's'}`;

    if (configs.length === 0) {
        grid.innerHTML = '<div class="global-error">No panorama image was passed to the WebView. This is an extension configuration error.</div>';
        return;
    }

    const vertexShaderSource = `#version 300 es
    in vec2 aPosition;
    out vec2 vNdc;

    void main() {
        vNdc = aPosition;
        gl_Position = vec4(aPosition, 0.0, 1.0);
    }`;

    const fragmentShaderSource = `#version 300 es
    precision highp float;

    in vec2 vNdc;
    out vec4 outColor;

    uniform sampler2D uTexture;
    uniform float uAspect;
    uniform float uFov;
    uniform float uYaw;
    uniform float uPitch;

    const float PI = 3.14159265358979323846;

    void main() {
        float t = tan(uFov * 0.5);
        vec3 d = normalize(vec3(vNdc.x * uAspect * t, vNdc.y * t, 1.0));

        float cp = cos(uPitch);
        float sp = sin(uPitch);
        vec3 dp = vec3(d.x, d.y * cp + d.z * sp, -d.y * sp + d.z * cp);

        float cy = cos(uYaw);
        float sy = sin(uYaw);
        vec3 w = vec3(dp.x * cy + dp.z * sy, dp.y, -dp.x * sy + dp.z * cy);

        float lon = atan(w.x, w.z);
        float lat = asin(clamp(w.y, -1.0, 1.0));
        float u = lon / (2.0 * PI) + 0.5;
        float v = lat / PI + 0.5;

        outColor = texture(uTexture, vec2(fract(u), clamp(v, 0.0, 1.0)));
    }`;

    function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, value)); }
    function wrapPi(value) {
        while (value > Math.PI) value -= 2 * Math.PI;
        while (value < -Math.PI) value += 2 * Math.PI;
        return value;
    }

    function compileShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(shader) || 'Unknown shader error';
            gl.deleteShader(shader);
            throw new Error(log);
        }
        return shader;
    }

    function createProgram(gl) {
        const vs = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
        const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
        const program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const log = gl.getProgramInfoLog(program) || 'Unknown program link error';
            gl.deleteProgram(program);
            throw new Error(log);
        }
        return program;
    }

    class PanoramaViewer {
        constructor(card, config, index) {
            this.card = card;
            this.config = config;
            this.index = index;
            this.canvas = card.querySelector('canvas');
            this.status = card.querySelector('.status');
            this.errorBox = card.querySelector('.error');
            this.errorBox.hidden = true;
            this.state = { ...DEFAULT_STATE };
            this.dragging = false;
            this.lastX = 0;
            this.lastY = 0;
            this.imageWidth = 0;
            this.imageHeight = 0;
            this.dirty = true;

            this.gl = this.canvas.getContext('webgl2', {
                alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false
            });

            if (!this.gl) {
                this.fail('WebGL2 is unavailable in this VS Code WebView.');
                return;
            }

            try {
                this.initGL();
                this.bindEvents();
                this.loadTexture(config.uri);
            } catch (error) {
                this.fail(error instanceof Error ? error.message : String(error));
            }
        }

        initGL() {
            const gl = this.gl;
            this.program = createProgram(gl);
            this.locations = {
                aPosition: gl.getAttribLocation(this.program, 'aPosition'),
                uTexture: gl.getUniformLocation(this.program, 'uTexture'),
                uAspect: gl.getUniformLocation(this.program, 'uAspect'),
                uFov: gl.getUniformLocation(this.program, 'uFov'),
                uYaw: gl.getUniformLocation(this.program, 'uYaw'),
                uPitch: gl.getUniformLocation(this.program, 'uPitch')
            };

            const vertices = new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]);
            this.vao = gl.createVertexArray();
            gl.bindVertexArray(this.vao);
            this.buffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
            gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
            gl.enableVertexAttribArray(this.locations.aPosition);
            gl.vertexAttribPointer(this.locations.aPosition, 2, gl.FLOAT, false, 0, 0);

            this.texture = gl.createTexture();
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            this.setFilter(filterMode.value);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([32,32,32,255]));
            gl.useProgram(this.program);
            gl.uniform1i(this.locations.uTexture, 0);

            this.resizeObserver = new ResizeObserver(() => {
                this.resize();
                this.requestRender();
            });
            this.resizeObserver.observe(this.card);
        }

        loadTexture(uri) {
            const image = new Image();
            image.decoding = 'async';
            image.onload = () => {
                const gl = this.gl;
                const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
                if (image.naturalWidth > maxTextureSize || image.naturalHeight > maxTextureSize) {
                    this.fail(`Image is ${image.naturalWidth}×${image.naturalHeight}, but this GPU/WebView supports textures up to ${maxTextureSize}×${maxTextureSize}.`);
                    return;
                }
                this.imageWidth = image.naturalWidth;
                this.imageHeight = image.naturalHeight;
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, this.texture);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
                this.setFilter(filterMode.value);
                this.requestRender();
                this.updateStatus(null);
                if (globalStatus) globalStatus.textContent = `${configs.length} image${configs.length === 1 ? '' : 's'} · loaded`;
            };
            image.onerror = () => this.fail('Failed to load image resource. If this is a Remote SSH workspace, make sure the file is readable from the VS Code workspace.');
            image.src = uri;
        }

        setFilter(mode) {
            if (!this.gl || !this.texture) return;
            const gl = this.gl;
            const filter = mode === 'nearest' ? gl.NEAREST : gl.LINEAR;
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
            this.requestRender();
        }

        fail(message) {
            this.errorBox.hidden = false;
            this.errorBox.textContent = message;
            if (globalStatus) globalStatus.textContent = 'Error — see viewer';
            console.error('[ERP Panorama Viewer]', message);
        }

        resize() {
            if (!this.gl) return;
            const rect = this.canvas.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const width = Math.max(1, Math.round(rect.width * dpr));
            const height = Math.max(1, Math.round(rect.height * dpr));
            if (this.canvas.width !== width || this.canvas.height !== height) {
                this.canvas.width = width;
                this.canvas.height = height;
                this.dirty = true;
            }
        }

        bindEvents() {
            this.canvas.addEventListener('pointerdown', (event) => {
                this.dragging = true;
                this.lastX = event.clientX;
                this.lastY = event.clientY;
                this.canvas.setPointerCapture(event.pointerId);
                this.canvas.classList.add('dragging');
                setActive(this);
            });

            this.canvas.addEventListener('pointermove', (event) => {
                setActive(this);
                if (this.dragging) {
                    const dx = event.clientX - this.lastX;
                    const dy = event.clientY - this.lastY;
                    this.lastX = event.clientX;
                    this.lastY = event.clientY;
                    this.state.yaw = wrapPi(this.state.yaw - dx * 0.0045);
                    this.state.pitch = clamp(this.state.pitch + dy * 0.0045, -89 * DEG, 89 * DEG);
                    propagateState(this);
                    this.requestRender();
                }
                this.updateStatus(event);
            });

            const endDrag = (event) => {
                this.dragging = false;
                this.canvas.classList.remove('dragging');
                if (event && this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
            };
            this.canvas.addEventListener('pointerup', endDrag);
            this.canvas.addEventListener('pointercancel', endDrag);

            this.canvas.addEventListener('wheel', (event) => {
                event.preventDefault();
                setActive(this);
                this.state.fov = clamp(this.state.fov * Math.exp(event.deltaY * 0.0011), 25, 110);
                propagateState(this);
                this.requestRender();
                this.updateStatus(event);
            }, { passive: false });

            this.canvas.addEventListener('dblclick', () => {
                setActive(this);
                this.reset();
                propagateState(this);
            });
        }

        reset() {
            this.state = { ...DEFAULT_STATE };
            this.requestRender();
            this.updateStatus(null);
        }

        setState(state) {
            this.state.yaw = state.yaw;
            this.state.pitch = state.pitch;
            this.state.fov = state.fov;
            this.requestRender();
            this.updateStatus(null);
        }

        requestRender() {
            this.dirty = true;
            scheduleFrame();
        }

        render() {
            if (!this.gl || !this.dirty) return;
            this.resize();
            const gl = this.gl;
            const aspect = this.canvas.width / Math.max(1, this.canvas.height);
            gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            gl.clearColor(0.05, 0.05, 0.05, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.useProgram(this.program);
            gl.bindVertexArray(this.vao);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.uniform1f(this.locations.uAspect, aspect);
            gl.uniform1f(this.locations.uFov, this.state.fov * DEG);
            gl.uniform1f(this.locations.uYaw, this.state.yaw);
            gl.uniform1f(this.locations.uPitch, this.state.pitch);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            this.dirty = false;
        }

        pointerToERP(event) {
            if (!event || !this.imageWidth || !this.imageHeight) return null;
            const rect = this.canvas.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return null;
            const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            const ny = 1 - ((event.clientY - rect.top) / rect.height) * 2;
            const aspect = rect.width / rect.height;
            const t = Math.tan(this.state.fov * DEG * 0.5);
            let x = nx * aspect * t, y = ny * t, z = 1;
            const inv = 1 / Math.hypot(x, y, z);
            x *= inv; y *= inv; z *= inv;
            const cp = Math.cos(this.state.pitch), sp = Math.sin(this.state.pitch);
            const y1 = y * cp + z * sp, z1 = -y * sp + z * cp, x1 = x;
            const cy = Math.cos(this.state.yaw), sy = Math.sin(this.state.yaw);
            const x2 = x1 * cy + z1 * sy, y2 = y1, z2 = -x1 * sy + z1 * cy;
            const lon = Math.atan2(x2, z2);
            const lat = Math.asin(clamp(y2, -1, 1));
            let u = lon / (2 * Math.PI) + 0.5;
            u -= Math.floor(u);
            const imageV = 0.5 - lat / Math.PI;
            return {
                px: clamp(Math.floor(u * this.imageWidth), 0, this.imageWidth - 1),
                py: clamp(Math.floor(imageV * this.imageHeight), 0, this.imageHeight - 1),
                lon, lat
            };
        }

        updateStatus(event) {
            if (!this.status) return;
            const point = this.pointerToERP(event);
            const yaw = this.state.yaw * RAD;
            const pitch = this.state.pitch * RAD;
            if (point) {
                this.status.textContent = `x=${point.px}, y=${point.py} · lon=${(point.lon * RAD).toFixed(2)}°, lat=${(point.lat * RAD).toFixed(2)}° · yaw=${yaw.toFixed(1)}°, pitch=${pitch.toFixed(1)}°, FOV=${this.state.fov.toFixed(1)}°`;
            } else if (this.imageWidth && this.imageHeight) {
                this.status.textContent = `${this.imageWidth}×${this.imageHeight} · yaw=${yaw.toFixed(1)}°, pitch=${pitch.toFixed(1)}°, FOV=${this.state.fov.toFixed(1)}°`;
            } else {
                this.status.textContent = 'Loading…';
            }
        }
    }

    const viewers = [];
    let activeViewer = null;
    let framePending = false;

    function setActive(viewer) { activeViewer = viewer; }
    function scheduleFrame() {
        if (framePending) return;
        framePending = true;
        requestAnimationFrame(() => {
            framePending = false;
            for (const viewer of viewers) viewer.render();
            if (viewers.some((viewer) => viewer.dirty)) scheduleFrame();
        });
    }
    function propagateState(source) {
        if (!syncBox.checked) return;
        for (const viewer of viewers) if (viewer !== source) viewer.setState(source.state);
    }

    function makeCard(config) {
        const card = document.createElement('section');
        card.className = 'viewer-card';
        const canvas = document.createElement('canvas');
        canvas.className = 'viewer-canvas';
        canvas.setAttribute('aria-label', `360 panorama viewer: ${config.name}`);
        const badge = document.createElement('div');
        badge.className = 'badge';
        badge.textContent = config.name;
        const status = document.createElement('div');
        status.className = 'status';
        status.textContent = 'Loading…';
        const errorBox = document.createElement('div');
        errorBox.className = 'error';
        errorBox.hidden = true;
        card.append(canvas, badge, status, errorBox);
        return card;
    }

    configs.forEach((config, index) => {
        const card = makeCard(config);
        grid.appendChild(card);
        viewers.push(new PanoramaViewer(card, config, index));
    });

    if (viewers.length > 0) activeViewer = viewers[0];
    filterMode.addEventListener('change', () => {
        for (const viewer of viewers) viewer.setFilter(filterMode.value);
    });
    resetButton.addEventListener('click', () => {
        const source = activeViewer || viewers[0];
        if (!source) return;
        source.reset();
        if (syncBox.checked) for (const viewer of viewers) if (viewer !== source) viewer.setState(source.state);
    });
    syncBox.addEventListener('change', () => {
        if (!syncBox.checked || viewers.length < 2) return;
        const source = activeViewer || viewers[0];
        for (const viewer of viewers) if (viewer !== source) viewer.setState(source.state);
    });
    window.addEventListener('resize', () => {
        for (const viewer of viewers) {
            viewer.resize();
            viewer.requestRender();
        }
    });
    scheduleFrame();
})();
