"use client";

import React, { useEffect, useRef, useState } from "react";
import { X, Flashlight, AlertCircle } from "lucide-react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string>("");
  const [isFlashSupported, setIsFlashSupported] = useState(false);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const controlsRef = useRef<IScannerControls | null>(null);
  const zxingReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const nativeDetectorRef = useRef<any>(null);
  
  const lastScanTimeRef = useRef<number>(0);
  const lastScanCodeRef = useRef<string>("");
  const streamRef = useRef<MediaStream | null>(null);
  const requestAnimationRef = useRef<number>(0);

  useEffect(() => {
    let mounted = true;

    const initScanner = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Camera API not supported in this browser. Are you using HTTPS?");
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" }
        });
        
        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // Check for torch
        const track = stream.getVideoTracks()[0];
        if (track) {
          const capabilities = track.getCapabilities?.();
          if (capabilities && (capabilities as any).torch) {
            setIsFlashSupported(true);
          }
        }

        // Try Native BarcodeDetector first
        if ('BarcodeDetector' in window) {
          try {
            const detector = new (window as any).BarcodeDetector({
              formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code']
            });
            nativeDetectorRef.current = detector;
            scanLoopNative();
            return; // Successfully using native
          } catch (e) {
            console.log("Native BarcodeDetector failed, falling back to ZXing", e);
          }
        }

        // Fallback to ZXing
        startZXing(stream);

      } catch (err: any) {
        if (mounted) {
          setError(err?.message || "Failed to start camera. Please check permissions.");
        }
      }
    };

    const processScan = (text: string) => {
      const now = Date.now();
      // Debounce identical scans for 1.5 seconds
      if (text !== lastScanCodeRef.current || now - lastScanTimeRef.current > 1500) {
        lastScanCodeRef.current = text;
        lastScanTimeRef.current = now;
        onScan(text);
      }
    };

    const scanLoopNative = async () => {
      if (!mounted || !videoRef.current || !nativeDetectorRef.current) return;
      
      try {
        const barcodes = await nativeDetectorRef.current.detect(videoRef.current);
        if (barcodes.length > 0) {
          processScan(barcodes[0].rawValue);
        }
      } catch (e) {
        // ignore errors from detection frame
      }
      
      requestAnimationRef.current = requestAnimationFrame(scanLoopNative);
    };

    const startZXing = async (stream: MediaStream) => {
      if (!mounted || !videoRef.current) return;
      
      const codeReader = new BrowserMultiFormatReader();
      zxingReaderRef.current = codeReader;
      
      try {
        const controls = await codeReader.decodeFromVideoDevice(
          undefined, 
          videoRef.current, 
          (result, err) => {
            if (result && mounted) {
              processScan(result.getText());
            }
          }
        );
        if (mounted) {
          controlsRef.current = controls;
        } else {
          controls.stop();
        }
      } catch (e) {
        if (mounted) {
           setError("Failed to initialize ZXing fallback scanner.");
        }
      }
    };

    initScanner();

    return () => {
      mounted = false;
      if (requestAnimationRef.current) {
        cancelAnimationFrame(requestAnimationRef.current);
      }
      if (controlsRef.current) {
        controlsRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [onScan]);

  const toggleFlash = async () => {
    try {
      const track = streamRef.current?.getVideoTracks()[0];
      if (track) {
        const nextFlash = !isFlashOn;
        await track.applyConstraints({
          advanced: [{ torch: nextFlash } as any]
        });
        setIsFlashOn(nextFlash);
      }
    } catch (err) {
      console.error("Failed to toggle flash", err);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black">
      {/* Header */}
      <div className="flex justify-between items-center p-4 bg-black/50 backdrop-blur-md absolute top-0 left-0 right-0 z-10">
        <h2 className="text-white font-bold text-lg">Scan Barcode</h2>
        <div className="flex space-x-4">
          {isFlashSupported && (
            <button 
              onClick={toggleFlash}
              className={`p-2 rounded-full ${isFlashOn ? 'bg-yellow-400 text-black' : 'bg-gray-800 text-white'}`}
            >
              <Flashlight className="w-5 h-5" />
            </button>
          )}
          <button onClick={onClose} className="p-2 bg-gray-800 text-white rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      
      {/* Camera Feed */}
      <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden">
        {error ? (
          <div className="p-6 bg-red-900/50 rounded-xl flex flex-col items-center text-center max-w-sm mx-auto">
            <AlertCircle className="w-12 h-12 text-red-400 mb-3" />
            <p className="text-white font-medium mb-4">{error}</p>
            <div className="w-full text-left">
              <label className="text-xs text-white/70 mb-1 block">Type barcode manually:</label>
              <input 
                type="text" 
                className="w-full px-4 py-2 rounded-lg text-black font-bold focus:outline-none"
                placeholder="Enter barcode..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onScan(e.currentTarget.value);
                  }
                }}
              />
            </div>
            <button 
              onClick={onClose}
              className="mt-6 px-6 py-2 bg-white text-black font-bold rounded-lg w-full"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <video 
              ref={videoRef} 
              className="absolute w-full h-full object-cover"
              playsInline
              muted
            />
            {/* Viewfinder overlay */}
            <div className="absolute inset-0 z-0 pointer-events-none flex flex-col">
              <div className="flex-1 bg-black/50"></div>
              <div className="flex">
                <div className="flex-1 bg-black/50"></div>
                <div className="w-64 h-48 sm:w-80 sm:h-64 relative border-2 border-green-500 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] bg-transparent overflow-hidden">
                   <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-500 -mt-[2px] -ml-[2px] rounded-tl-xl" />
                   <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-green-500 -mt-[2px] -mr-[2px] rounded-tr-xl" />
                   <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-green-500 -mb-[2px] -ml-[2px] rounded-bl-xl" />
                   <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-500 -mb-[2px] -mr-[2px] rounded-br-xl" />
                   <div className="absolute w-full h-[2px] bg-red-500/80 top-1/2 left-0 shadow-[0_0_8px_rgba(239,68,68,1)] animate-pulse" />
                </div>
                <div className="flex-1 bg-black/50"></div>
              </div>
              <div className="flex-1 bg-black/50"></div>
            </div>
            
            <p className="absolute bottom-12 text-white/90 text-sm font-semibold z-10 px-5 py-2.5 bg-black/60 backdrop-blur-sm rounded-full">
              Align barcode within the frame
            </p>
          </>
        )}
      </div>
    </div>
  );
}
