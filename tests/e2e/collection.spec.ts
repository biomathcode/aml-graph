import { test, expect } from '@playwright/test'
test('operator creates a session, subject uploads PDF, operator reviews it', async ({
  page,
  browser,
}) => {
  const email = `browser-${crypto.randomUUID()}@example.com`
  await page.goto('/sign-in')
  const signup = await page.request.post('/api/auth/sign-up/email', {
    data: { name: 'Browser tester', email, password: 'Strong-passphrase-123!' },
  })
  expect(signup.ok()).toBeTruthy()
  await page.goto('/dashboard')
  await expect(
    page.getByRole('heading', { name: 'Dashboard', exact: true }),
  ).toBeVisible()
  const workflow = await (
    await page.request.post('/api/rpc/workflows.create', {
      data: {
        name: 'Browser workflow',
        type: 'kyc',
        status: 'active',
        steps: [],
      },
    })
  ).json()
  const session = await (
    await page.request.post('/api/rpc/sessions.create', {
      data: { workflowId: workflow },
    })
  ).json()
  const subject = await browser.newContext(),
    collection = await subject.newPage()
  await collection.goto(
    `/sessions/${session.sessionId}?token=${session.publicToken}`,
  )
  await expect(
    collection.getByRole('heading', { name: 'Submit your documents' }),
  ).toBeVisible()
  await collection.getByRole('checkbox').check()
  await collection.locator('input[type=file]').setInputFiles({
    name: 'identity.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF',
    ),
  })
  await expect(collection.getByText('identity.pdf')).toBeVisible()
  await collection.getByRole('button', { name: 'Submit for review' }).click()
  await expect(
    collection.getByRole('heading', { name: 'Documents submitted' }),
  ).toBeVisible()
  await page.goto(`/verifications/${session.sessionId}`)
  await expect(page.getByText('identity.pdf — Download document')).toBeVisible()
  await page
    .getByRole('textbox', { name: 'Review notes' })
    .fill('Document received and reviewed in browser test')
  await page.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(
    page.getByText('Collection: completed · Decision: approved'),
  ).toBeVisible()
  await page.goto('/documents')
  await expect(page.getByRole('link', { name: 'identity.pdf' })).toBeVisible()
  await page.screenshot({ path: '/tmp/open-kyc-documents.png', fullPage: true })
  await page.request.post('/api/rpc/sessions.delete', {
    data: { sessionId: session.sessionId },
  })
  await page.request.post('/api/rpc/workflows.delete', {
    data: { id: workflow },
  })
  await subject.close()
})

test('operator creates a workflow and questionnaire through the UI',async({page})=>{
 const email=`browser-${crypto.randomUUID()}@example.com`
 await page.goto('/sign-up')
 await page.getByLabel('First name').fill('Browser')
 await page.getByLabel('Last name').fill('tester')
 await page.getByLabel('Work email').fill(email)
 await page.locator('#password').fill('Strong-passphrase-123!')
 await page.locator('#password_confirmation').fill('Strong-passphrase-123!')
 await page.getByRole('button',{name:'Create an account'}).click()
 await expect(page.getByRole('heading',{name:'Dashboard',exact:true})).toBeVisible()
 await page.goto('/workflow')
 await page.getByRole('textbox',{name:'Name',exact:true}).fill('UI collection workflow')
 await page.getByRole('button',{name:'Add checklist step'}).click()
 await page.getByRole('button',{name:'Save workflow'}).click()
 await expect(page.getByRole('heading',{name:'UI collection workflow'})).toBeVisible()
 await page.goto('/questionnaires')
 await page.getByRole('textbox',{name:'Questionnaire title'}).fill('UI questionnaire')
 await page.getByRole('button',{name:'Create questionnaire'}).click()
 await expect(page.getByRole('heading',{name:'Edit questionnaire'})).toBeVisible()
 await page.getByRole('textbox',{name:'New question'}).fill('What documents are you providing?')
 await page.getByRole('button',{name:'Add question'}).click()
 await expect(page.getByRole('textbox',{name:'Question text'})).toHaveValue('What documents are you providing?')
 await page.getByRole('button',{name:'Publish',exact:true}).click()
 await expect(page.getByRole('link',{name:'Open public form'})).toBeVisible()
})

test('operator review checklist shows per-step Requested Document Type', async ({
  page,
}) => {
  const email = `browser-${crypto.randomUUID()}@example.com`
  await page.goto('/sign-in')
  const signup = await page.request.post('/api/auth/sign-up/email', {
    data: { name: 'Checklist tester', email, password: 'Strong-passphrase-123!' },
  })
  expect(signup.ok()).toBeTruthy()
  await page.goto('/dashboard')
  await expect(
    page.getByRole('heading', { name: 'Dashboard', exact: true }),
  ).toBeVisible()
  const workflow = await (
    await page.request.post('/api/rpc/workflows.create', {
      data: {
        name: 'Checklist workflow',
        type: 'kyc',
        status: 'active',
        steps: [
          {
            id: 'checklist-id',
            label: 'ID Document',
            enabled: true,
            type: 'id_verification',
            documentType: 'passport',
          },
          {
            id: 'checklist-address',
            label: 'Residential Address',
            enabled: true,
            type: 'address_check',
          },
        ],
      },
    })
  ).json()
  const session = await (
    await page.request.post('/api/rpc/sessions.create', {
      data: { workflowId: workflow },
    })
  ).json()

  await page.goto(`/verifications/${session.sessionId}`)
  const idRow = page.locator('[title="ID Document (id_verification)"]')
  await expect(idRow.getByText('Requested Document Type')).toBeVisible()
  await expect(idRow.getByText('Passport', { exact: true })).toBeVisible()
  // Steps without their own type inherit the workflow-level requested type.
  const addressRow = page.locator(
    '[title="Residential Address (address_check)"]',
  )
  await expect(addressRow.getByText('Any Government ID')).toBeVisible()
  await addressRow.scrollIntoViewIfNeeded()
  await page.screenshot({ path: '/tmp/open-kyc-review-checklist.png' })

  await page.request.post('/api/rpc/sessions.delete', {
    data: { sessionId: session.sessionId },
  })
  await page.request.post('/api/rpc/workflows.delete', { data: { id: workflow } })
})
