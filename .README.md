# Wave Equation Solver - Cyberpunk Edition

This project is an interactive, cyberpunk-themed web app for visualizing and exploring solutions to the wave equation in 1D, 2D, and 3D. It features real-time simulation, parameter controls, and dynamic visualizations.

## Features

- **Wave Type Selection:**  
  Choose between 1D String, 2D Membrane, 3D Acoustic, and Electromagnetic waves.

- **Boundary Conditions:**  
  Select from Fixed Ends, Free Ends, Periodic, or Absorbing boundaries.

- **Initial Conditions:**  
  Options include Plucked String, Struck String, Gaussian Pulse, Sinusoidal, Square Wave, or a Custom Function.

- **Physical Parameters:**  
  - Wave Speed (c)
  - Damping Factor (γ)
  - Length (L)
  - Tension (T)
  - Density (ρ)
  - Wave-specific parameters (e.g., width, mode numbers, permittivity, permeability, temperature, medium)

- **Time Evolution:**  
  Control the simulation time with a slider or play/pause real-time animation.

- **Visualization Modes:**  
  - Displacement
  - Velocity
  - Energy Density (kinetic and potential)
  - Frequency Spectrum (FFT)

- **Live Stats:**  
  - Total Energy
  - Max Amplitude
  - Fundamental Frequency
  - Wavelength
  - Phase Velocity
  - Kinetic/Total Energy Ratio

- **Cyberpunk UI:**  
  Animated neon grid, holographic overlays, glitch effects, and responsive design.

## Usage

1. Open [index.html](index.html) in your browser.
2. Adjust wave type, boundary and initial conditions, and physical parameters in the left panel.
3. Click **INITIALIZE WAVE** to set up the simulation.
4. Use the **PLAY/PAUSE** button to animate the wave.
5. Switch between visualization modes (Displacement, Velocity, Energy, Frequency).
6. View live statistics in the lower panel.

## Dependencies

- [Plotly.js](https://plotly.com/javascript/) (loaded via CDN)

## File Structure

- `index.html` — Main application and all logic/styles.
- `.README.md` — This documentation.
- `.gitignore` — Standard ignores for Node, macOS, VS Code, etc.

## Customization

You can extend the simulation by editing the JavaScript in [index.html](index.html), for example to add new initial conditions or visualization features.

---

Enjoy exploring the wave equation in style!