'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Plus, BookOpen, ArrowRight, Share2, Copy, Trash2, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getProducts, createProduct, deleteProduct, getCurrentAdmin } from '@/app/actions'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

type Product = {
  id: string
  name: string
  price: number
  classId: number
  type: 'BOOK' | 'COURSE'
}

export default function AdminPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [newProduct, setNewProduct] = useState<{
    name: string
    price: string
    classId: string
    paymentPhoneNumber: string
    acceptsVodafoneCash: boolean
    acceptsInstapay: boolean
    type: 'BOOK' | 'COURSE'
  }>({ 
    name: '', 
    price: '', 
    classId: '',
    paymentPhoneNumber: '',
    acceptsVodafoneCash: true,
    acceptsInstapay: true,
    type: 'BOOK'
  })
  const router = useRouter()
  useEffect(() => {
    checkAuth()
    
    // Poll for updates every 10 seconds
    const interval = setInterval(() => {
      loadProducts()
    }, 10000)

    return () => clearInterval(interval)
  }, [])

  async function checkAuth() {
    const admin = await getCurrentAdmin()
    if (!admin) {
      router.push('/admin/login')
      return
    }
    loadProducts()
  }

  async function loadProducts() {
    setLoading(true)
    const data = await getProducts()
    setProducts(data)
    setLoading(false)
  }

  async function handleCreateProduct() {
    if (!newProduct.name || !newProduct.price || !newProduct.classId) {
      toast.error('الرجاء ملء جميع الحقول')
      return
    }

    try {
      await createProduct({
        name: newProduct.name,
        price: parseFloat(newProduct.price),
        classId: parseInt(newProduct.classId),
        paymentPhoneNumber: newProduct.paymentPhoneNumber,
        acceptsVodafoneCash: newProduct.acceptsVodafoneCash,
        acceptsInstapay: newProduct.acceptsInstapay,
        type: newProduct.type
      })
      toast.success('تم إنشاء المنتج بنجاح')
      setOpen(false)
      setNewProduct({ 
        name: '', 
        price: '', 
        classId: '',
        paymentPhoneNumber: '',
        acceptsVodafoneCash: true,
        acceptsInstapay: true,
        type: 'BOOK'
      })
      loadProducts()
    } catch (error) {
      toast.error('فشل إنشاء المنتج')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8" dir="rtl">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="relative w-12 h-12 md:w-16 md:h-16 flex-shrink-0">
              <Image 
                src="/logo.png" 
                alt="TaleemPay Logo" 
                fill 
                className="object-contain"
              />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900">TaleemPay</h1>
              <p className="text-sm md:text-base text-muted-foreground">لوحة تحكم المسؤول - إدارة المنتجات وتتبع التوزيع.</p>
            </div>
          </div>
          <div className="flex gap-2 w-full md:w-auto justify-end">
            <Link href="/admin/profile">
              <Button variant="outline" size="icon" title="الملف الشخصي">
                <User className="h-4 w-4" />
              </Button>
            </Link>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="flex-1 md:flex-none">
                  <Plus className="ml-2 h-4 w-4" /> إنشاء منتج
                </Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="text-right">إنشاء منتج جديد</DialogTitle>
                <DialogDescription className="text-right">
                  أضف منتجاً جديداً للنظام.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="name" className="text-right">الاسم</Label>
                  <Input
                    id="name"
                    value={newProduct.name}
                    onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                    className="col-span-3 text-right"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="price" className="text-right">السعر</Label>
                  <Input
                    id="price"
                    type="number"
                    value={newProduct.price}
                    onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                    className="col-span-3 text-right"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="classId" className="text-right">الفرقة</Label>
                  <Select 
                    value={newProduct.classId} 
                    onValueChange={(value) => setNewProduct({ ...newProduct, classId: value })}
                  >
                    <SelectTrigger className="col-span-3" dir="rtl">
                      <SelectValue placeholder="اختر الفرقة" />
                    </SelectTrigger>
                    <SelectContent align="end">
                      <SelectItem value="1">الفرقة 1</SelectItem>
                      <SelectItem value="2">الفرقة 2</SelectItem>
                      <SelectItem value="3">الفرقة 3</SelectItem>
                      <SelectItem value="4">الفرقة 4</SelectItem>
                      <SelectItem value="5">الفرقة 5</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="phone" className="text-right">رقم الدفع</Label>
                  <Input
                    id="phone"
                    placeholder="010xxxxxxxx"
                    value={newProduct.paymentPhoneNumber}
                    onChange={(e) => setNewProduct({ ...newProduct, paymentPhoneNumber: e.target.value })}
                    className="col-span-3 text-right"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="type" className="text-right">النوع</Label>
                  <Select 
                    value={newProduct.type} 
                    onValueChange={(value) => setNewProduct({ ...newProduct, type: value as 'BOOK' | 'COURSE' })}
                  >
                    <SelectTrigger className="col-span-3" dir="rtl">
                      <SelectValue placeholder="اختر النوع" />
                    </SelectTrigger>
                    <SelectContent align="end">
                      <SelectItem value="BOOK">كتاب</SelectItem>
                      <SelectItem value="COURSE">كورس</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">طرق الدفع</Label>
                  <div className="col-span-3 flex gap-4">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="vodafone"
                        checked={newProduct.acceptsVodafoneCash}
                        onChange={(e) => setNewProduct({ ...newProduct, acceptsVodafoneCash: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <label htmlFor="vodafone" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        فودافون كاش
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="instapay"
                        checked={newProduct.acceptsInstapay}
                        onChange={(e) => setNewProduct({ ...newProduct, acceptsInstapay: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <label htmlFor="instapay" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        انستاباي
                      </label>
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleCreateProduct}>حفظ {newProduct.type === 'COURSE' ? 'الكورس' : 'الكتاب'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">جاري تحميل المنتجات...</div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <Card key={product.id} className="hover:shadow-md transition-shadow relative group">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="flex items-center gap-2">
                      {product.type === 'COURSE' ? (
                        <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-sm font-medium">كورس</span>
                      ) : (
                        <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-sm font-medium">كتاب</span>
                      )}
                      <span className="flex-1">{product.name}</span>
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => {
                        const url = `${window.location.origin}/product/${product.id}`
                        navigator.clipboard.writeText(url)
                        toast.success('تم نسخ الرابط')
                      }}
                      title="نسخ رابط المشاركة"
                    >
                      <Share2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <CardDescription>الفرقة {product.classId} • {product.price} جنيه</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">
                    {product.type === 'COURSE' 
                      ? 'اضغط لعرض الإحصائيات وتفعيل الكورس.'
                      : 'اضغط لعرض الإحصائيات والماسح الضوئي.'
                    }
                  </div>
                </CardContent>
                <CardFooter className="gap-2">
                  <Link href={`/admin/product/${product.id}`} className="flex-1">
                    <Button variant="secondary" className="w-full">
                      عرض التفاصيل <ArrowRight className="mr-2 h-4 w-4 rotate-180" />
                    </Button>
                  </Link>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="destructive" size="icon" title="حذف المنتج">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle className="text-right">حذف المنتج</DialogTitle>
                        <DialogDescription className="text-right">
                          هل أنت متأكد أنك تريد حذف "{product.name}"؟ لا يمكن التراجع عن هذا الإجراء وسيتم حذف جميع الطلبات المرتبطة به.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button variant="destructive" onClick={async () => {
                          try {
                            await deleteProduct(product.id)
                            toast.success('تم حذف المنتج بنجاح')
                            loadProducts()
                          } catch (error) {
                            toast.error('فشل حذف المنتج')
                          }
                        }}>
                          حذف
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </CardFooter>
              </Card>
            ))}
            {products.length === 0 && (
              <div className="col-span-full text-center py-12 text-muted-foreground bg-white rounded-lg border border-dashed">
                لا توجد منتجات. قم بإنشاء منتج للبدء.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
