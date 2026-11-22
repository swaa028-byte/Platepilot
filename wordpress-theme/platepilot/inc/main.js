/* PlatePilot theme behaviors: mobile menu, dropdown disclosures, feature
   tabs, and the typed rotating hero word. No dependencies. */
(function () {
	"use strict";

	/* Mobile menu ------------------------------------------------------------ */
	var menuButton = document.querySelector(".mobile-menu-button");
	var navigation = document.getElementById("main-navigation");
	if (menuButton && navigation) {
		menuButton.addEventListener("click", function () {
			var open = navigation.classList.toggle("is-open");
			menuButton.setAttribute("aria-expanded", open ? "true" : "false");
		});
	}

	/* Dropdown disclosures ---------------------------------------------------- */
	document.querySelectorAll(".nav-drop-btn").forEach(function (button) {
		button.addEventListener("click", function () {
			var expanded = button.getAttribute("aria-expanded") === "true";
			document.querySelectorAll(".nav-drop-btn").forEach(function (other) {
				other.setAttribute("aria-expanded", "false");
			});
			button.setAttribute("aria-expanded", expanded ? "false" : "true");
		});
	});
	document.addEventListener("click", function (event) {
		if (!event.target.closest(".nav-group")) {
			document.querySelectorAll(".nav-drop-btn").forEach(function (button) {
				button.setAttribute("aria-expanded", "false");
			});
		}
	});
	document.addEventListener("keydown", function (event) {
		if (event.key === "Escape") {
			document.querySelectorAll(".nav-drop-btn").forEach(function (button) {
				button.setAttribute("aria-expanded", "false");
			});
		}
	});

	/* Feature tabs ------------------------------------------------------------ */
	var tabs = document.querySelectorAll(".cw-tab-bar [role=tab]");
	tabs.forEach(function (tab) {
		tab.addEventListener("click", function () {
			tabs.forEach(function (other) {
				other.setAttribute("aria-selected", other === tab ? "true" : "false");
			});
			document.querySelectorAll(".cw-tab-panel").forEach(function (panel) {
				panel.hidden = panel.getAttribute("data-panel") !== tab.getAttribute("data-tab");
			});
		});
	});

	/* Typed rotating hero word -------------------------------------------------- */
	var rotate = document.querySelector(".cw-rotate");
	if (rotate) {
		var words = [];
		try { words = JSON.parse(rotate.getAttribute("data-words") || "[]"); } catch (error) { words = []; }
		var target = rotate.querySelector(".cw-rotate-text");
		var caret = rotate.querySelector(".cw-rotate-caret");
		var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		var index = 0, typed = "", phase = "typing";
		function render() {
			if (target) target.textContent = words[index] || "";
			if (caret) caret.classList.toggle("is-idle", phase === "pausing");
		}
		function tick() {
			var word = words[index] || "";
			if (phase === "typing") {
				if (typed.length < word.length) { typed = word.slice(0, typed.length + 1); render(); setTimeout(tick, 75); }
				else { phase = "pausing"; render(); setTimeout(tick, 1900); }
			} else if (phase === "pausing") {
				phase = "erasing"; setTimeout(tick, 400);
			} else {
				if (typed.length > 0) { typed = word.slice(0, typed.length - 1); render(); setTimeout(tick, 38); }
				else { index = (index + 1) % words.length; phase = "typing"; render(); setTimeout(tick, 120); }
			}
		}
		if (words.length && target) {
			if (reduced) {
				render();
				setInterval(function () { index = (index + 1) % words.length; render(); }, 3200);
			} else {
				tick();
			}
		}
	}
})();

	/* GSAP scroll reveals ------------------------------------------------------ */
	if (window.gsap && window.ScrollTrigger && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
		gsap.registerPlugin(ScrollTrigger);
		gsap.utils.toArray(".cw-mode-card, .info-card, .step-row, .cw-step, .cw-center-head").forEach(function (el) {
			gsap.from(el, { y: 26, opacity: 0, duration: 0.7, ease: "power2.out",
				scrollTrigger: { trigger: el, start: "top 88%", once: true } });
		});
	}

	/* three.js hero room -------------------------------------------------------- */
	var heroRoom = document.querySelector(".cw-hero");
	if (heroRoom && window.THREE && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
		try {
			var width = heroRoom.clientWidth || 1200;
			var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
			renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
			renderer.setSize(width, 420);
			renderer.domElement.className = "hero-room-canvas";
			renderer.domElement.setAttribute("aria-hidden", "true");
			heroRoom.insertBefore(renderer.domElement, heroRoom.firstChild);
			var scene = new THREE.Scene();
			var camera = new THREE.PerspectiveCamera(40, width / 420, 0.1, 100);
			camera.position.set(0, 6.5, 11);
			camera.lookAt(0, 0, 0);
			var group = new THREE.Group();
			scene.add(group);
			var palette = [0x2ea36a, 0xc68a3e, 0x527aa2, 0x8a6b98, 0x4d8f6d];
			var offsets = [[-5.5, 0, -1], [5.2, 0, -2], [-1.5, 0, 2.5], [2.5, 0, 1.5], [0, 0, -4]];
			offsets.forEach(function (o, i) {
				var table = new THREE.Mesh(
					new THREE.CylinderGeometry(0.9, 0.9, 0.28, 24),
					new THREE.MeshStandardMaterial({ color: palette[i % palette.length], roughness: 0.55, metalness: 0.1 })
				);
				table.position.set(o[0], o[1], o[2]);
				table.userData.spin = (i % 2 ? 1 : -1) * (0.15 + i * 0.03);
				group.add(table);
				var ring = new THREE.Mesh(
					new THREE.TorusGeometry(1.25, 0.03, 8, 48),
					new THREE.MeshStandardMaterial({ color: 0x5fd68f, transparent: true, opacity: 0.35 })
				);
				ring.rotation.x = Math.PI / 2;
				ring.position.set(o[0], o[1] - 0.1, o[2]);
				group.add(ring);
			});
			var floor = new THREE.Mesh(
				new THREE.PlaneGeometry(40, 40),
				new THREE.MeshStandardMaterial({ color: 0x0e2b23, roughness: 1 })
			);
			floor.rotation.x = -Math.PI / 2;
			floor.position.y = -0.2;
			group.add(floor);
			scene.add(new THREE.HemisphereLight(0xdfeee6, 0x0b241d, 1.1));
			var key = new THREE.DirectionalLight(0xffffff, 0.9);
			key.position.set(4, 8, 6);
			scene.add(key);
			var running = true, t0 = performance.now();
			function frame(now) {
				if (!running) return;
				group.rotation.y = Math.sin((now - t0) / 6000) * 0.22;
				group.children.forEach(function (child) {
					if (child.userData.spin) child.rotation.y += child.userData.spin * 0.01;
					if (child.geometry && child.geometry.type === "CylinderGeometry") child.position.y = Math.sin((now - t0) / 2400 + child.position.x) * 0.12;
				});
				renderer.render(scene, camera);
				requestAnimationFrame(frame);
			}
			requestAnimationFrame(frame);
			document.addEventListener("visibilitychange", function () {
				running = !document.hidden;
				if (running) { t0 = performance.now(); requestAnimationFrame(frame); }
			});
		} catch (error) { /* No WebGL: the gradient hero stays. */ }
	}
