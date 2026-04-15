{
  description = "Mauvoisin development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }:
    flake-utils.lib.eachDefaultSystem (
      system: let
        pkgs = import nixpkgs {inherit system;};

        nodejs = pkgs.nodejs_22 or pkgs.nodejs_20;
      in {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs

            # Container runtime (Supabase local dev uses Docker API)
            podman
            docker-client
            docker-compose

            # Faster linker for native builds (opt-in via flags)
            mold

            # Helpful for NixOS where npm esbuild binaries can be troublesome.
            esbuild

            # Common build inputs for node-gyp / native deps
            python3
            pkg-config
            gnumake
            stdenv.cc

            # Comfort / editor tooling
            typescript-language-server
          ];

          # Prefer project-local binaries (eslint, tsx, vite, ...)
          shellHook = ''
            export PATH="$PWD/node_modules/.bin:$PATH"

            # For rootless Podman (recommended): expose a Docker-compatible socket.
            export DOCKER_HOST="unix://$XDG_RUNTIME_DIR/podman/podman.sock"

            # Force Vite/esbuild to use the Nix-provided binary.
            export ESBUILD_BINARY_PATH="${pkgs.lib.getExe pkgs.esbuild}"

            cat <<'EOF'
            Mauvoisin dev shell ready.

            Common commands:
              npm install
              npm run dev
              npm run lint
              npm run build
              npm run generate:lunar-chemistry
              npm exec -- supabase --version
              npm exec -- supabase start

            Notes (NixOS):
              - Supabase CLI comes from npm here. On NixOS you may need nix-ld:
                programs.nix-ld.enable = true;
              - Podman rootless is assumed. Make sure the user socket exists:
                systemctl --user enable --now podman.socket
              - mold is available; if you want to use it for builds, try:
                export NIX_CFLAGS_LINK="-fuse-ld=mold"
            EOF
          '';
        };
      }
    );
}
