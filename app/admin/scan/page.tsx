"use client";

import { useState, useEffect } from "react";
import {
  getProducts,
  markOrderDelivered,
  getCurrentAdmin,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Scanner } from "@/components/scanner";
import {
  ArrowRight,
  ScanLine,
  Check,
  ChevronsUpDown,
  X,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Define Product type locally as in other files
type Product = {
  id: string;
  name: string;
  price: number;
  classId: number;
  type: "BOOK" | "COURSE";
};

export default function AdminScanPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [openCombobox, setOpenCombobox] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastScannedResult, setLastScannedResult] = useState<{
    success: boolean;
    studentName?: string;
    productName?: string;
    error?: string;
    timestamp: number;
  } | null>(null);

  const router = useRouter();

  useEffect(() => {
    checkAuthAndLoadProducts();
  }, []);

  async function checkAuthAndLoadProducts() {
    try {
      const admin = await getCurrentAdmin();
      if (!admin) {
        router.push("/admin/login");
        return;
      }

      const data = await getProducts();
      setProducts(data);
    } catch (error) {
      toast.error("فشل تحميل المنتجات");
    } finally {
      setLoading(false);
    }
  }

  const handleScan = async (text: string) => {
    if (selectedProductIds.length === 0) {
      toast.error("يرجى اختيار منتج واحد على الأقل");
      return;
    }

    try {
      const result = await markOrderDelivered(text, selectedProductIds);

      if (result.success) {
        setLastScannedResult({
          success: true,
          studentName: result.studentName,
          productName: result.productName,
          timestamp: Date.now(),
        });
        toast.success(
          <div className="flex flex-col gap-1">
            <span className="text-lg font-bold">
              تم تسليم {result.productName} بنجاح!
            </span>
            <span className="text-2xl font-extrabold text-green-700">
              {result.studentName}
            </span>
          </div>,
          { duration: 5000 },
        );
        return true;
      } else {
        setLastScannedResult({
          success: false,
          error: result.error,
          timestamp: Date.now(),
        });
        toast.error(result.error || "خطأ في المسح");
        return false;
      }
    } catch (error) {
      console.error("Scan error:", error);
      toast.error("خطأ غير متوقع");
      return false;
    }
  };

  const clearLastResult = () => {
    setLastScannedResult(null);
  };

  const toggleProduct = (productId: string) => {
    setSelectedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
    setLastScannedResult(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8" dir="rtl">
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin">
            <Button variant="ghost" size="icon">
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            ماسح الرموز
          </h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>اختر المنتجات</CardTitle>
            <CardDescription>
              حدد المنتجات التي تريد مسح أكواد الطلاب لها
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openCombobox}
                  className="w-full justify-between h-auto min-h-10"
                >
                  {selectedProductIds.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {selectedProductIds.map((id) => {
                        const product = products.find((p) => p.id === id);
                        return (
                          <Badge key={id} variant="secondary" className="mr-1">
                            {product?.name}
                          </Badge>
                        );
                      })}
                    </div>
                  ) : (
                    "اختر المنتجات..."
                  )}
                  <ChevronsUpDown className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-full p-0 pointer-events-auto"
                align="end"
              >
                <Command>
                  <CommandInput
                    placeholder="بحث عن منتج..."
                    className="text-right"
                  />
                  <CommandList>
                    <CommandEmpty>لا توجد منتجات.</CommandEmpty>
                    <CommandGroup>
                      {products.map((product) => (
                        <CommandItem
                          key={product.id}
                          value={product.name}
                          onSelect={() => toggleProduct(product.id)}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <div
                            className={cn(
                              "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                              selectedProductIds.includes(product.id)
                                ? "bg-primary text-primary-foreground"
                                : "opacity-50 [&_svg]:invisible",
                            )}
                          >
                            <Check className={cn("h-4 w-4")} />
                          </div>
                          <span>{product.name}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </CardContent>
        </Card>

        {selectedProductIds.length > 0 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <Scanner
              onScan={handleScan}
              title=""
              description=""
              className="overflow-hidden border-2 border-primary/20 shadow-lg"
            />

            {/* Result Display */}
            {lastScannedResult && (
              <Card
                className={`animate-in zoom-in-95 duration-300 ${
                  lastScannedResult.success
                    ? "bg-green-50 border-green-200"
                    : "bg-red-50 border-red-200"
                }`}
              >
                <CardContent className="p-6 text-center">
                  {lastScannedResult.success ? (
                    <div className="space-y-2">
                      <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-2">
                        <ScanLine className="h-6 w-6 text-green-600" />
                      </div>
                      <h3 className="text-xl font-bold text-green-800">
                        تم التسليم بنجاح
                      </h3>
                      <p className="text-lg font-medium text-gray-900">
                        {lastScannedResult.studentName}
                      </p>
                      <p className="text-sm text-gray-500">
                        {lastScannedResult.productName}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-2">
                        <ScanLine className="h-6 w-6 text-red-600" />
                      </div>
                      <h3 className="text-xl font-bold text-red-800">
                        خطأ في التسليم
                      </h3>
                      <p className="text-base text-red-700 font-medium">
                        {lastScannedResult.error}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 border-red-200 hover:bg-red-100 text-red-700"
                        onClick={clearLastResult}
                      >
                        محاولة مرة أخرى
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="text-center text-sm text-gray-500 mt-4">
              يمكنك مسح كود QR الخاص بالطالب لتأكيد استلامه لأي من المنتجات
              المحددة فوراً.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
