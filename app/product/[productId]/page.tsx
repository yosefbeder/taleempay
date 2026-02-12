"use client";

import {
  getProduct,
  createOrder,
  getStudentOrder,
  getStudent,
} from "../../actions";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Check, Loader2, ArrowRight, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import Link from "next/link";
import { StudentSelector } from "@/components/student-selector";
import { QRCodeSVG as QRCode } from "qrcode.react";
import { use } from "react";

// Define types locally to avoid import issues during refactor
type Product = {
  id: string;
  name: string;
  price: number;
  classId: number;
  paymentPhoneNumber: string | null;
  acceptsVodafoneCash: boolean;
  acceptsInstapay: boolean;
  type: "BOOK" | "COURSE";
  admin?: {
    name: string;
  } | null;
};

type Student = {
  id: string;
  name: string;
  settingId: string;
  classId: number;
};

type Order = {
  id: string;
  status: string;
  paymentScreenshotPath: string | null;
  paymentScreenshotKey?: string | null;
  activationPhoneNumber?: string | null;
  qrCodeString?: string;
  urlCreatedAt?: number;
};

export default function ProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = use(params);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [activationPhone, setActivationPhone] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const isEditingRef = useRef(isEditing);

  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  // Load selected student from localStorage on mount
  useEffect(() => {
    async function loadStudent() {
      const savedStudent = localStorage.getItem("selectedStudent");

      if (savedStudent) {
        try {
          const parsedStudent = JSON.parse(savedStudent);
          // Verify student exists in DB
          const verifiedStudent = await getStudent(parsedStudent.id);

          if (verifiedStudent) {
            setSelectedStudent(parsedStudent);
          } else {
            // Invalid localStorage
            console.log("Invalid student in localStorage, clearing...");
            localStorage.removeItem("selectedStudent");
            setSelectedStudent(null);
          }
        } catch (e) {
          console.error("Error verifying localStorage student", e);
          localStorage.removeItem("selectedStudent");
          setSelectedStudent(null);
        }
      }
    }
    loadStudent();
  }, []);

  useEffect(() => {
    loadProduct();
  }, [productId]);

  useEffect(() => {
    if (selectedStudent && product) {
      if (selectedStudent.classId !== product.classId) {
        handleClearStudent();
        toast.error("تم تغيير الطالب لأن المنتج لفرقة دراسية مختلفة");
        return;
      }

      checkExistingOrder();
    }
  }, [selectedStudent, product]);

  async function loadProduct() {
    try {
      const data = await getProduct(productId);
      setProduct(data);
    } catch (error) {
      toast.error("فشل تحميل تفاصيل المنتج");
    } finally {
      setLoading(false);
    }
  }

  async function checkExistingOrder() {
    if (!selectedStudent || !product) return;

    // Don't poll if user is editing/uploading to prevent UI resets
    if (isEditingRef.current) return;

    try {
      const existingOrder = await getStudentOrder(
        selectedStudent.id,
        product.id,
      );

      setOrder((prevOrder) => {
        const newOrder = existingOrder as Order | null;
        if (!newOrder) return null;

        if (prevOrder && prevOrder.id === newOrder.id) {
          // Check if screenshot key is same
          if (
            prevOrder.paymentScreenshotKey === newOrder.paymentScreenshotKey &&
            prevOrder.paymentScreenshotPath
          ) {
            // Check expiration (45 mins = 2700000 ms)
            const now = Date.now();
            const isExpired =
              prevOrder.urlCreatedAt && now - prevOrder.urlCreatedAt > 2700000;

            if (!isExpired) {
              return {
                ...newOrder,
                paymentScreenshotPath: prevOrder.paymentScreenshotPath,
                urlCreatedAt: prevOrder.urlCreatedAt,
              };
            }
          }
        }

        return { ...newOrder, urlCreatedAt: Date.now() };
      });
      if (existingOrder?.activationPhoneNumber) {
        setActivationPhone(existingOrder.activationPhoneNumber);
      }
      // Do not reset isEditing here, as it interferes with "Try Again" functionality during polling
    } catch (error) {
      console.error("Failed to check existing order:", error);
    }
  }

  async function handlePayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedStudent) {
      toast.error("يرجى اختيار طالب أولاً");
      return;
    }

    if (product?.type === "COURSE" && !activationPhone) {
      toast.error("يرجى إدخال رقم هاتف التفعيل");
      return;
    }

    setUploading(true);
    const formData = new FormData(event.currentTarget);
    formData.append("studentId", selectedStudent.id);
    formData.append("productId", productId);

    if (product?.type === "COURSE") {
      formData.append("activationPhoneNumber", activationPhone);
    }

    try {
      const result = await createOrder(formData);
      if (result.success && result.order) {
        setOrder({ ...(result.order as Order), urlCreatedAt: Date.now() });
        setIsEditing(false); // Exit edit mode on success
        toast.success(
          order ? "تم تحديث البيانات بنجاح!" : "تم رفع إيصال الدفع بنجاح!",
        );
      } else {
        toast.error(result.error || "فشل رفع إيصال الدفع");
      }
    } catch (error) {
      toast.error("حدث خطأ ما");
    } finally {
      setUploading(false);
    }
  }

  const handleStudentChange = async (student: Student) => {
    setSelectedStudent(student);
    setOrder(null); // Reset order when student changes
    setActivationPhone(""); // Reset phone when student changes
    setIsEditing(false);
    localStorage.setItem("selectedStudent", JSON.stringify(student));
  };

  const handleClearStudent = async () => {
    setSelectedStudent(null);
    setOrder(null);
    setActivationPhone("");
    setIsEditing(false);
    localStorage.removeItem("selectedStudent");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!product) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-gray-50"
        dir="rtl"
      >
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">المنتج غير موجود</h1>
          <Link href="/">
            <Button className="mt-4">العودة للرئيسية</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8"
      dir="rtl"
    >
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex flex-col items-center justify-center space-y-2 mb-4">
          <div className="relative w-16 h-16">
            <img
              src="/logo.png"
              alt="TaleemPay Logo"
              className="object-contain w-full h-full"
            />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">TaleemPay</h1>
        </div>
        <Link
          href="/"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowRight className="ml-2 h-4 w-4" />
          العودة للمنتجات
        </Link>

        {/* Student Selection Card */}
        <Card>
          <CardHeader>
            <CardTitle>بيانات الطالب</CardTitle>
            <CardDescription>
              {selectedStudent
                ? "الطالب المحدد حالياً"
                : "يرجى اختيار الطالب الذي سيقوم بشراء هذا المنتج"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StudentSelector
              selectedStudent={selectedStudent}
              onSelect={handleStudentChange}
              onClear={handleClearStudent}
              classId={product.classId}
            />
          </CardContent>
        </Card>

        {/* Product Details Card */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  {product.type === "COURSE" ? (
                    <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-sm font-medium">
                      كورس
                    </span>
                  ) : (
                    <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-sm font-medium">
                      كتاب
                    </span>
                  )}
                  {product.name}
                </CardTitle>
                <CardDescription className="mt-1">
                  {product.admin?.name && `بواسطة ${product.admin.name}`}
                </CardDescription>
              </div>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary/10 text-primary">
                {product.price} جنيه
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {order && !isEditing ? (
              <div className="space-y-4">
                <div
                  className={`p-4 rounded-lg flex items-center space-x-3 ${
                    order.status === "PAID" || order.status === "DELIVERED"
                      ? "bg-green-50 text-green-700"
                      : order.status === "PENDING_CONFIRMATION"
                        ? "bg-yellow-50 text-yellow-700"
                        : order.status === "DECLINED"
                          ? "bg-red-50 text-red-700"
                          : "bg-blue-50 text-blue-700"
                  }`}
                >
                  {order.status === "PAID" || order.status === "DELIVERED" ? (
                    <Check className="h-5 w-5 flex-shrink-0" />
                  ) : order.status === "DECLINED" ? (
                    <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  ) : (
                    <Loader2 className="h-5 w-5 flex-shrink-0 animate-spin" />
                  )}
                  <p className="font-medium">
                    {order.status === "PENDING_CONFIRMATION" &&
                      "جاري مراجعة الدفع"}
                    {order.status === "PAID" &&
                      (product.type === "COURSE"
                        ? "تم تأكيد الدفع! جاري التفعيل..."
                        : "تم تأكيد الدفع! جاهز للاستلام.")}
                    {order.status === "DELIVERED" &&
                      (product.type === "COURSE"
                        ? "تم تفعيل الكورس"
                        : "تم تسليم المنتج")}
                    {order.status === "DECLINED" &&
                      "تم رفض الدفع. يرجى المحاولة مرة أخرى."}
                  </p>
                </div>

                {order.status === "DECLINED" && (
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => setIsEditing(true)}
                  >
                    محاولة مرة أخرى
                  </Button>
                )}

                {product.type === "COURSE" && order.activationPhoneNumber && (
                  <div className="bg-gray-50 p-3 rounded-lg border text-center mb-4">
                    <p className="text-sm text-gray-500 mb-1">رقم التفعيل</p>
                    <p
                      className="text-lg font-mono font-bold text-gray-900"
                      dir="ltr"
                    >
                      {order.activationPhoneNumber}
                    </p>
                  </div>
                )}

                {product.type === "BOOK" &&
                  order.status === "PAID" &&
                  order.qrCodeString && (
                    <div className="bg-white p-6 rounded-lg border flex flex-col items-center justify-center mb-4 shadow-sm">
                      <p className="text-sm text-gray-500 mb-4 font-medium">
                        كود الاستلام (QR Code)
                      </p>
                      <div className="bg-white p-2 rounded-lg border-2 border-dashed border-gray-200">
                        <QRCode value={order.qrCodeString} size={200} />
                      </div>
                      <p className="mt-4 text-xs text-gray-400 font-mono">
                        {order.qrCodeString}
                      </p>
                      <p className="mt-2 text-xs text-center text-gray-500 max-w-[200px]">
                        يرجى إظهار هذا الكود للمسؤول عند استلام الكتاب
                      </p>
                    </div>
                  )}

                {order.paymentScreenshotPath &&
                  order.status === "PENDING_CONFIRMATION" && (
                    <div className="w-full rounded-lg border overflow-hidden">
                      <img
                        src={order.paymentScreenshotPath}
                        alt="Payment Screenshot"
                        className="w-full h-auto"
                      />
                    </div>
                  )}

                {order.status === "PENDING_CONFIRMATION" && (
                  <div className="space-y-3">
                    <p className="text-sm text-center text-gray-500">
                      جاري التحقق من عملية الدفع. عادة ما يستغرق هذا بضع ساعات.
                    </p>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setIsEditing(true)}
                    >
                      تعديل البيانات / إعادة رفع الإيصال
                    </Button>
                  </div>
                )}
              </div>
            ) : selectedStudent ? (
              <form onSubmit={handlePayment} className="space-y-6">
                {isEditing && (
                  <div className="bg-yellow-50 p-3 rounded text-sm text-yellow-800 mb-4">
                    أنت تقوم بتعديل طلب موجود. سيتم تحديث بياناتك وإعادة إرسال
                    الطلب للمراجعة.
                  </div>
                )}

                <div className="space-y-4">
                  <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                    <h3 className="font-medium text-gray-900">طرق الدفع</h3>
                    {product.paymentPhoneNumber && (
                      <div className="space-y-2">
                        <p className="text-sm text-gray-600">
                          أرسل {product.price} جنيه إلى:
                        </p>
                        <div className="flex items-center justify-between bg-white p-2 rounded border">
                          <code className="text-lg font-mono font-bold text-primary">
                            {product.paymentPhoneNumber}
                          </code>
                        </div>
                        <div className="flex gap-2 text-xs text-gray-500">
                          {product.acceptsVodafoneCash && (
                            <span className="bg-red-50 text-red-700 px-2 py-1 rounded">
                              فودافون كاش
                            </span>
                          )}
                          {product.acceptsInstapay && (
                            <span className="bg-purple-50 text-purple-700 px-2 py-1 rounded">
                              انستا باي
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {product.type === "COURSE" && (
                    <div className="space-y-2">
                      <Label htmlFor="activationPhone">رقم هاتف التفعيل</Label>
                      <Input
                        id="activationPhone"
                        type="tel"
                        placeholder="أدخل رقم الهاتف لتفعيل الكورس عليه"
                        value={activationPhone}
                        onChange={(e) => setActivationPhone(e.target.value)}
                        required
                        className="text-right"
                      />
                      <p className="text-xs text-gray-500">
                        سيتم استخدام هذا الرقم لمنحك الوصول إلى الكورس.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="screenshot">
                      {isEditing
                        ? "رفع إيصال جديد (اختياري)"
                        : "رفع إيصال الدفع"}
                    </Label>
                    <Input
                      id="screenshot"
                      name="screenshot"
                      type="file"
                      accept="image/*"
                      required={!isEditing} // Not required if editing (unless we want to force re-upload)
                      className="cursor-pointer"
                    />
                    <p className="text-xs text-gray-500">
                      يرجى رفع صورة واضحة لإيصال التحويل.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  {isEditing && (
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setIsEditing(false)}
                    >
                      إلغاء
                    </Button>
                  )}
                  <Button
                    type="submit"
                    className={isEditing ? "flex-1" : "w-full"}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                        جاري الرفع...
                      </>
                    ) : (
                      <>
                        <Upload className="ml-2 h-4 w-4" />
                        {isEditing ? "تحديث البيانات" : "تأكيد الدفع"}
                      </>
                    )}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="text-center py-6 text-gray-500">
                يرجى اختيار طالب أعلاه للمتابعة في الدفع
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
