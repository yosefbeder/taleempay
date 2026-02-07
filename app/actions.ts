'use server'

import { PrismaClient } from '@prisma/client'
import { revalidatePath } from 'next/cache'

const prisma = new PrismaClient()

export async function searchStudents(query: string, classId?: number) {
  if (query.length < 3) return []

  try {
    const whereClause: any = {
      OR: [
        { name: { contains: query } },
        { settingId: { contains: query } },
      ],
    }

    if (classId) {
      whereClause.classId = classId
    }

    const students = await prisma.student.findMany({
      where: whereClause,
      take: 10,
    })
    return students
  } catch (error) {
    console.error('Search error:', error)
    return []
  }
}

export async function getProduct(productId: string) {
  if (!productId) return null
  try {
    return await prisma.product.findUnique({
      where: { id: productId },
      include: {
        admin: {
          select: {
            name: true
          }
        }
      }
    })
  } catch (error) {
    console.error('Get product error:', error)
    return null
  }
}

export async function getStudentOrder(studentId: string, productId: string) {
  try {
    const order = await prisma.order.findFirst({
      where: {
        studentId,
        productId,
        // We want to fetch the active order, whether it's pending, paid, or declined (so they can retry)
      },
      orderBy: { createdAt: 'desc' } // Get the latest one
    })

    if (order && order.paymentScreenshotPath && !order.paymentScreenshotPath.startsWith('http') && !order.paymentScreenshotPath.startsWith('/')) {
       try {
          const command = new GetObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME!,
            Key: order.paymentScreenshotPath,
          })
          const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 })
          return { ...order, paymentScreenshotPath: signedUrl, paymentScreenshotKey: order.paymentScreenshotPath }
        } catch (e) {
          console.error('Error generating signed URL for student order', e)
        }
    }

    return order
  } catch (error) {
    console.error('Get order error:', error)
    return null
  }
}

import { writeFile } from 'fs/promises'
import { join } from 'path'
import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import sharp from 'sharp'

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!)

export async function signupAdmin(data: { name: string; username: string; password: string; passcode: string }) {
  try {
    if (data.passcode !== process.env.ADMIN_SIGNUP_PASSCODE) {
      return { success: false, error: 'رمز المرور غير صحيح' }
    }

    const existingAdmin = await prisma.admin.findUnique({ where: { username: data.username } })
    if (existingAdmin) {
      console.log('Signup failed: Username already exists', data.username)
      return { success: false, error: 'اسم المستخدم مستخدم بالفعل' }
    }

    const hashedPassword = await bcrypt.hash(data.password, 10)
    
    const admin = await prisma.admin.create({
      data: {
        name: data.name,
        username: data.username,
        password: hashedPassword,
      },
    })

    const token = await new SignJWT({ id: admin.id, username: admin.username })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('24h')
      .sign(JWT_SECRET)

    const cookieStore = await cookies()
    cookieStore.set('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24, // 1 day
      path: '/',
    })

    return { success: true }
  } catch (error) {
    console.error('Signup error:', error)
    return { success: false, error: 'حدث خطأ أثناء إنشاء الحساب' }
  }
}

export async function loginAdmin(username: string, password: string) { // Changed signature to match usage
  try {
    const admin = await prisma.admin.findUnique({ where: { username } })
    if (!admin) {
      console.log('Login failed: User not found', username)
      return { success: false }
    }

    const isValid = await bcrypt.compare(password, admin.password)
    if (!isValid) {
      console.log('Login failed: Invalid password', username)
      return { success: false }
    }

    const token = await new SignJWT({ id: admin.id, username: admin.username })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('24h')
      .sign(JWT_SECRET)

    const cookieStore = await cookies()
    cookieStore.set('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24, // 1 day
      path: '/',
    })

    return { success: true }
  } catch (error) {
    console.error('Login error:', error)
    return { success: false }
  }
}

export async function logoutAdmin() {
  const cookieStore = await cookies()
  cookieStore.delete('admin_token')
  return { success: true }
}

export async function getCurrentAdmin() {
  const cookieStore = await cookies()
  const token = cookieStore.get('admin_token')?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    
    // Fetch fresh data from DB to get name and ensure user still exists
    const admin = await prisma.admin.findUnique({
      where: { id: payload.id as string },
      select: { id: true, username: true, name: true }
    })
    
    return admin
  } catch (error) {
    return null
  }
}

export async function createOrder(formData: FormData) {
  const studentId = formData.get('studentId') as string
  const productId = formData.get('productId') as string
  const screenshot = formData.get('screenshot') as File
  const activationPhoneNumber = formData.get('activationPhoneNumber') as string | null

  if (!studentId || !productId || !screenshot) {
    return { success: false, error: 'Missing required fields' }
  }

  let screenshotKey = ''

  try {
    // Convert File to Buffer
    const bytes = await screenshot.arrayBuffer()
    let buffer = Buffer.from(bytes);

    const isHeic = screenshot.name.toLowerCase().endsWith('.heic') || 
                   screenshot.name.toLowerCase().endsWith('.heif') ||
                   screenshot.type === 'image/heic' || 
                   screenshot.type === 'image/heif';

    if (isHeic) {
      const heicConvert = require('heic-convert');
      buffer = await heicConvert({
        buffer: buffer,
        format: 'JPEG',
        quality: 1
      });
    }

    // Compress and convert to JPEG using sharp
    const optimizedBuffer = await sharp(buffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer()

    const fileName = `payments/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`
    
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: fileName,
      Body: optimizedBuffer,
      ContentType: 'image/jpeg',
    }))

    screenshotKey = fileName

  } catch (error: any) {
    console.error('Upload error:', error)
    return { success: false, error: `Upload failed: ${error.message}` }
  }

  try {
    // Validate student exists
    const student = await prisma.student.findUnique({
      where: { id: studentId }
    })

    if (!student) {
      return { success: false, error: 'الطالب غير موجود. الرجاء إعادة اختيار الطالب.' }
    }

    // Check for existing order to update
    const existingOrder = await prisma.order.findFirst({
      where: { studentId, productId }
    })

    let order;
    if (existingOrder) {
      order = await prisma.order.update({
        where: { id: existingOrder.id },
        data: {
          status: 'PENDING_CONFIRMATION',
          paymentScreenshotPath: screenshotKey,
          activationPhoneNumber: activationPhoneNumber || existingOrder.activationPhoneNumber,
          createdAt: new Date() // Update timestamp to bump it up in lists
        }
      })
    } else {
      order = await prisma.order.create({
        data: {
          studentId,
          productId,
          status: 'PENDING_CONFIRMATION',
          paymentScreenshotPath: screenshotKey,
          activationPhoneNumber: activationPhoneNumber,
        },
      })
    }
      
    // Generate signed URL for immediate display
    let signedUrl = screenshotKey
    try {
      const command = new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: screenshotKey,
      })
      signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 })
    } catch (e) {
      console.error('Error generating signed URL', e)
    }

    revalidatePath(`/product/${productId}`)
    return { success: true, order: { ...order, paymentScreenshotPath: signedUrl } }

  } catch (error: any) {
    console.error('Create order error:', error)
    return { success: false, error: `Database error: ${error.message}` }
  }
}

export async function confirmPayment(orderId: string) {
  try {
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'PAID' },
    })
    const order = await prisma.order.findUnique({ where: { id: orderId } })
    if (order) {
      revalidatePath(`/admin/product/${order.productId}`)
    }
    return { success: true }
  } catch (error) {
    console.error('Confirm payment error:', error)
    throw new Error('Failed to confirm payment')
  }
}

export async function declinePayment(orderId: string) {
  try {
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'DECLINED' },
    })
    const order = await prisma.order.findUnique({ where: { id: orderId } })
    if (order) {
      revalidatePath(`/admin/product/${order.productId}`)
    }
    return { success: true }
  } catch (error) {
    console.error('Decline payment error:', error)
    throw new Error('Failed to decline payment')
  }
}

export async function bulkConfirmPayments(productId: string) {
  try {
    const result = await prisma.order.updateMany({
      where: {
        productId,
        status: 'PENDING_CONFIRMATION',
      },
      data: {
        status: 'PAID',
      },
    })
    revalidatePath(`/admin/product/${productId}`)
    return { success: true, count: result.count }
  } catch (error) {
    console.error('Bulk confirm error:', error)
    throw new Error('Failed to bulk confirm')
  }
}

export async function updateAdminProfile(data: { name?: string; password?: string }) {
  const currentAdmin = await getCurrentAdmin()
  if (!currentAdmin) throw new Error('Unauthorized')

  try {
    const updateData: any = {}
    if (data.name) updateData.name = data.name
    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 10)
    }

    await prisma.admin.update({
      where: { id: currentAdmin.id },
      data: updateData,
    })

    return { success: true }
  } catch (error) {
    console.error('Update profile error:', error)
    throw new Error('Failed to update profile')
  }
}

// Admin Actions

export async function getProducts() {
  const currentAdmin = await getCurrentAdmin()
  if (!currentAdmin) return []

  try {
    return await prisma.product.findMany({
      where: { adminId: currentAdmin.id },
      orderBy: { name: 'asc' },
    })
  } catch (error) {
    console.error('Get products error:', error)
    return []
  }
}

export async function createProduct(data: { 
  name: string; 
  price: number; 
  classId: number;
  paymentPhoneNumber?: string;
  acceptsVodafoneCash?: boolean;
  acceptsInstapay?: boolean;
  type?: 'BOOK' | 'COURSE';
}) {
  const currentAdmin = await getCurrentAdmin()
  if (!currentAdmin) throw new Error('Unauthorized')

  try {
    const product = await prisma.product.create({
      data: {
        name: data.name,
        price: data.price,
        classId: data.classId,
        isActive: true,
        paymentPhoneNumber: data.paymentPhoneNumber,
        acceptsVodafoneCash: data.acceptsVodafoneCash ?? true,
        acceptsInstapay: data.acceptsInstapay ?? true,
        adminId: currentAdmin.id,
        type: data.type || 'BOOK',
      },
    })
    revalidatePath('/admin')
    return product
  } catch (error) {
    console.error('Create product error:', error)
    throw new Error('Failed to create product')
  }
}

// Student Actions

export async function getStudent(id: string) {
  try {
    return await prisma.student.findUnique({
      where: { id },
    })
  } catch (error) {
    console.error('Get student error:', error)
    return null
  }
}

export async function getStudentProducts(studentId: string) {
  try {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
    })

    if (!student) return null

    const products = await prisma.product.findMany({
      where: { 
        classId: student.classId,
        isActive: true
      },
      include: {
        orders: {
          where: { studentId: student.id },
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        admin: {
          select: {
            name: true
          }
        }
      }
    })

    return {
      student,
      products: products.map(product => ({
        ...product,
        order: product.orders[0] || null
      }))
    }
  } catch (error) {
    console.error('Get student products error:', error)
    return null
  }
}

export async function getProductStats(productId: string) {
  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { 
        orders: {
          include: { student: true }
        } 
      },
    })

    if (!product) throw new Error('Product not found')

    const paidOrders = product.orders.filter(o => o.status === 'PAID' || o.status === 'DELIVERED')
    const deliveredOrders = product.orders.filter(o => o.status === 'DELIVERED')
    const pendingPickup = product.orders.filter(o => o.status === 'PAID')
    const pendingConfirmation = product.orders.filter(o => o.status === 'PENDING_CONFIRMATION')
    const totalSales = paidOrders.length

    const paidStudentIds = new Set(paidOrders.map(o => o.studentId))
    const pendingConfirmationStudentIds = new Set(pendingConfirmation.map(o => o.studentId))
    
    // Fetch all students in the class to find unpaid ones
    const allStudents = await prisma.student.findMany({
      where: { classId: product.classId }
    })
    
    // Unpaid means they haven't PAID, DELIVERED, or PENDING_CONFIRMATION.
    // This list will now include DECLINED students.
    const unpaidStudentsList = allStudents.filter(s => 
      !paidStudentIds.has(s.id) && !pendingConfirmationStudentIds.has(s.id)
    )

    // Generate Signed URLs for pending confirmation orders
    const pendingConfirmationOrdersWithUrls = await Promise.all(pendingConfirmation.map(async (o) => {
      let signedUrl = o.paymentScreenshotPath
      
      // If path is a key (doesn't start with http or /), generate signed URL
      if (o.paymentScreenshotPath && !o.paymentScreenshotPath.startsWith('http') && !o.paymentScreenshotPath.startsWith('/')) {
        try {
          const command = new GetObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME!,
            Key: o.paymentScreenshotPath,
          })
          signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }) // 1 hour
        } catch (e) {
          console.error('Error generating signed URL for', o.paymentScreenshotPath, e)
        }
      }

      return {
        id: o.id,
        studentId: o.studentId,
        studentName: o.student.name,
        screenshotUrl: signedUrl,
        screenshotKey: o.paymentScreenshotPath,
        createdAt: o.createdAt,
        activationPhoneNumber: o.activationPhoneNumber
      }
    }))

    return {
      product,
      stats: {
        totalSales,
        pendingPickup: pendingPickup.length,
        pendingConfirmationCount: pendingConfirmation.length,
        unpaidStudents: unpaidStudentsList.length,
        delivered: deliveredOrders.length,
        pendingOrders: pendingPickup.map(o => ({
          id: o.id,
          studentId: o.studentId,
          studentName: o.student.name,
          qrCodeString: o.qrCodeString,
          status: o.status,
          createdAt: o.createdAt,
          activationPhoneNumber: o.activationPhoneNumber
        })),
        pendingConfirmationOrders: pendingConfirmationOrdersWithUrls,
        unpaidStudentsList: unpaidStudentsList.map(s => {
          // Check if student has a DECLINED order
          const studentOrder = product.orders.find(o => o.studentId === s.id)
          const status = studentOrder?.status === 'DECLINED' ? 'DECLINED' : 'UNPAID'
          
          return {
            id: s.id,
            name: s.name,
            settingId: s.settingId,
            status: status
          }
        }),
        paidOrders: paidOrders.map(o => ({
          id: o.id,
          studentId: o.studentId,
          studentName: o.student.name,
          status: o.status,
          createdAt: o.createdAt,
          activationPhoneNumber: o.activationPhoneNumber
        }))
      }
    }
  } catch (error) {
    console.error('Get stats error:', error)
    return null
  }
}

export async function markOrderDelivered(qrCodeString: string) {
  try {
    const order = await prisma.order.findUnique({
      where: { qrCodeString },
      include: { student: true, product: true },
    })

    if (!order) throw new Error('كود QR غير صحيح')

    // If already delivered, return error
    if (order.status === 'DELIVERED') {
      throw new Error('تم تسليم هذا الطلب بالفعل')
    }

    if (order.status !== 'PAID') {
      if (order.status === 'PENDING_CONFIRMATION') throw new Error('الطلب في انتظار التأكيد')
      if (order.status === 'DECLINED') throw new Error('تم رفض الطلب')
      throw new Error('الطلب غير مدفوع')
    }

    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: { status: 'DELIVERED' },
    })

    revalidatePath(`/admin/product/${order.productId}`)
    return { success: true, studentName: order.student.name, productName: order.product.name }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function setStudentStatus(studentId: string, productId: string, status: string) {
  try {
    if (status === 'UNPAID') {
      // Delete the order if it exists
      const order = await prisma.order.findFirst({
        where: { studentId, productId }
      })
      
      if (order) {
        await prisma.order.delete({
          where: { id: order.id }
        })
      }
    } else {
      // Upsert the order
      const existingOrder = await prisma.order.findFirst({
        where: { studentId, productId }
      })

      // Generate QR code if needed (for PAID/DELIVERED status)
      let qrCodeString = existingOrder?.qrCodeString
      if ((status === 'PAID' || status === 'DELIVERED') && !qrCodeString) {
        qrCodeString = crypto.randomUUID()
      }

      if (existingOrder) {
        await prisma.order.update({
          where: { id: existingOrder.id },
          data: { 
            status,
            qrCodeString: qrCodeString || existingOrder.qrCodeString
          }
        })
      } else {
        await prisma.order.create({
          data: {
            studentId,
            productId,
            status,
            qrCodeString: qrCodeString
          }
        })
      }
    }

    revalidatePath(`/admin/product/${productId}`)
    return { success: true }
  } catch (error: any) {
    console.error('Set status error:', error)
    return { success: false, error: error.message }
  }
}

export async function bulkSetStudentStatus(studentIds: string[], productId: string, status: string) {
  try {
    if (status === 'UNPAID') {
      // Delete orders
      await prisma.order.deleteMany({
        where: {
          productId,
          studentId: { in: studentIds }
        }
      })
    } else {
      // Generate QR codes for all if needed
      // Since we can't easily do this in a single bulk update with different UUIDs,
      // iteration is the best approach here as well.
      
      await prisma.$transaction(
        async (tx) => {
          for (const studentId of studentIds) {
            const existingOrder = await tx.order.findFirst({
              where: { studentId, productId }
            })

            let qrCodeString = existingOrder?.qrCodeString
            if ((status === 'PAID' || status === 'DELIVERED') && !qrCodeString) {
              qrCodeString = crypto.randomUUID()
            }

            if (existingOrder) {
              await tx.order.update({
                where: { id: existingOrder.id },
                data: { 
                  status,
                  qrCodeString: qrCodeString || existingOrder.qrCodeString
                }
              })
            } else {
              await tx.order.create({
                data: {
                  studentId,
                  productId,
                  status,
                  qrCodeString: qrCodeString
                }
              })
            }
          }
        }
      )
    }

    revalidatePath(`/admin/product/${productId}`)
    return { success: true }
  } catch (error: any) {
    console.error('Bulk set status error:', error)
    return { success: false, error: error.message }
  }
}

export async function deleteProduct(productId: string) {
  try {
    await prisma.order.deleteMany({
      where: { productId }
    })

    await prisma.product.delete({
      where: { id: productId }
    })
    
    revalidatePath('/admin')
    return { success: true }
  } catch (error) {
    console.error('Delete product error:', error)
    throw new Error('Failed to delete product')
  }
}

// Student Cookie Management

export async function setStudentCookie(studentId: string) {
  const cookieStore = await cookies()
  cookieStore.set('student_id', studentId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })
  return { success: true }
}

export async function getStudentFromCookie() {
  const cookieStore = await cookies()
  const studentId = cookieStore.get('student_id')?.value
  
  if (!studentId) return null

  try {
    return await prisma.student.findUnique({
      where: { id: studentId }
    })
  } catch (error) {
    console.error('Get student from cookie error:', error)
    return null
  }
}

export async function clearStudentCookie() {
  const cookieStore = await cookies()
  cookieStore.delete('student_id')
  return { success: true }
}
