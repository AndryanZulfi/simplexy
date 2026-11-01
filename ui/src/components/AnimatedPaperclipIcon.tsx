import type { SVGProps } from "react";
import { cn } from "../lib/utils";

export function AnimatedSimplexyIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 360 410"
      className={cn("simplexy-thinking-icon paperclip-thinking-icon", className)}
      aria-hidden="true"
      {...props}
    >
      <g className="simplexy-thinking-icon-group">
        <path
          className="simplexy-lobe-a"
          d="M 242 17 L 255 17 L 271 21 L 284 29 L 291 36 L 292 35 L 291 37 L 297 44 L 303 60 L 304 75 L 300 92 L 291 107 L 279 118 L 265 125 L 256 127 L 241 127 L 232 125 L 202 113 L 187 112 L 168 116 L 152 123 L 143 129 L 128 143 L 121 154 L 115 172 L 114 185 L 119 206 L 124 215 L 134 226 L 139 230 L 141 229 L 140 230 L 145 234 L 156 239 L 172 242 L 189 242 L 195 244 L 201 248 L 205 253 L 208 260 L 208 270 L 205 278 L 200 284 L 189 289 L 180 289 L 174 287 L 168 283 L 155 266 L 138 248 L 114 231 L 103 226 L 86 221 L 62 219 L 51 216 L 39 210 L 31 203 L 23 192 L 17 175 L 18 152 L 23 139 L 31 129 L 30 127 L 31 128 L 43 118 L 62 111 L 81 111 L 101 115 L 125 115 L 139 112 L 158 104 L 173 93 L 180 85 L 191 66 L 196 52 L 205 38 L 220 25 L 228 21 L 242 17 Z"
          fill="currentColor"
        />
        <path
          className="simplexy-lobe-b"
          d="M 174 146 L 188 146 L 198 151 L 207 161 L 212 177 L 219 189 L 235 203 L 254 210 L 297 211 L 307 214 L 318 220 L 330 232 L 338 249 L 339 271 L 337 280 L 333 289 L 323 302 L 306 313 L 289 317 L 268 315 L 246 315 L 232 317 L 210 323 L 193 331 L 180 340 L 176 344 L 177 345 L 175 344 L 159 362 L 148 379 L 133 393 L 134 394 L 132 393 L 123 398 L 112 401 L 97 401 L 88 399 L 74 392 L 65 384 L 54 366 L 51 354 L 51 341 L 55 326 L 62 314 L 72 304 L 71 303 L 73 304 L 76 301 L 89 295 L 99 293 L 111 293 L 123 296 L 133 301 L 144 310 L 147 312 L 148 311 L 148 313 L 160 319 L 169 321 L 185 321 L 208 314 L 212 311 L 211 310 L 213 311 L 213 309 L 215 310 L 221 306 L 235 292 L 242 278 L 244 269 L 244 251 L 241 240 L 234 227 L 223 216 L 221 217 L 223 219 L 219 213 L 207 207 L 191 204 L 170 203 L 160 197 L 153 187 L 151 180 L 151 171 L 154 161 L 163 151 L 174 146 Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

export const AnimatedPaperclipIcon = AnimatedSimplexyIcon;

/** Full-page loading state: a centered, animated Simplexy emblem. */
export function SimplexyLoading({ className }: { className?: string }) {
  return (
    <div
      role="status"
      className={cn("flex min-h-dvh w-full items-center justify-center", className)}
    >
      <div className="flex flex-col items-center gap-4">
        <AnimatedSimplexyIcon className="h-20 w-20 text-primary" />
        <span className="sr-only">Loading…</span>
      </div>
    </div>
  );
}

export const PaperclipLoading = SimplexyLoading;
