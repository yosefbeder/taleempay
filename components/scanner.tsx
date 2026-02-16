"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Scanner as QrScanner } from "@yudiel/react-qr-scanner";
import JsQR from "jsqr";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

interface ScannerProps {
  onScan: (code: string) => Promise<any> | void;
  title?: string;
  description?: string;
  className?: string;
}

export function Scanner({
  onScan,
  title = "ماسح QR",
  description = "امسح كود QR",
  className,
}: ScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [showScanner, setShowScanner] = useState(true);
  const [manualCode, setManualCode] = useState("");
  const lastScannedRef = useRef<{ code: string; time: number } | null>(null);

  const playSuccessSound = () => {
    try {
      const AudioContext =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;

      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime); // High beep
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1); // Drop pitch

      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) {
      console.error("Error playing sound:", e);
    }
  };

  const handleScan = async (text: string) => {
    // Debounce: Ignore if same code scanned within 3 seconds
    const now = Date.now();
    if (
      lastScannedRef.current &&
      lastScannedRef.current.code === text &&
      now - lastScannedRef.current.time < 3000
    ) {
      return;
    }

    lastScannedRef.current = { code: text, time: now };

    if (scanning) return;
    setScanning(true);

    try {
      const result = await onScan(text);
      if (result !== false) {
        playSuccessSound();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setScanning(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = JsQR(imageData.data, imageData.width, imageData.height);
          if (code) {
            handleScan(code.data);
          } else {
            toast.error("لم يتم العثور على كود QR في الصورة");
          }
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Button
            variant={showScanner ? "destructive" : "default"}
            onClick={() => setShowScanner(!showScanner)}
            size="sm"
          >
            {showScanner ? "إيقاف الكاميرا" : "تشغيل الكاميرا"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showScanner ? (
          <div className="p-0 relative overflow-hidden rounded-lg border border-neutral-200 aspect-square bg-black">
            <div className="absolute inset-0 w-full h-full">
              <QrScanner
                onScan={(result) => {
                  if (result && result.length > 0) {
                    handleScan(result[0].rawValue);
                  }
                }}
                styles={{
                  container: { width: "100%", height: "100%" },
                  video: { objectFit: "cover" },
                }}
                components={{
                  torch: true,
                  zoom: true,
                }}
              />
            </div>
            {/* Overlay Guide */}
            <div className="absolute inset-0 border-2 border-white/50 m-12 rounded-lg pointer-events-none flex items-center justify-center z-10">
              <div className="w-full h-0.5 bg-red-500/80 animate-pulse relative top-0" />
            </div>

            {scanning && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20 backdrop-blur-sm">
                <div className="text-white flex flex-col items-center">
                  <Loader2 className="h-10 w-10 animate-spin mb-2" />
                  <span className="font-bold">جاري المعالجة...</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="aspect-video bg-muted rounded-lg flex items-center justify-center text-muted-foreground">
            <p>الكاميرا متوقفة</p>
          </div>
        )}

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              أو أدخل يدوياً / رفع صورة
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="أدخل كود QR UUID"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            className="text-right"
          />
          <Button onClick={() => handleScan(manualCode)} disabled={!manualCode}>
            تأكيد
          </Button>
        </div>

        <div className="flex items-center justify-center w-full">
          <label
            htmlFor="qr-upload-component"
            className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100"
          >
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <Upload className="w-8 h-8 mb-4 text-gray-500" />
              <p className="mb-2 text-sm text-gray-500">
                <span className="font-semibold">اضغط لرفع</span> صورة QR
              </p>
            </div>
            <input
              id="qr-upload-component"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
          </label>
        </div>
      </CardContent>
    </Card>
  );
}
