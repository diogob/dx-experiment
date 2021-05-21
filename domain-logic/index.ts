import { z } from 'zod'
import type { ZodTypeAny } from 'zod'
import { PrismaClient } from '@prisma/client'
import zipObject from 'lodash/zipObject'

const prisma = new PrismaClient()

const taskCreateParser = z.object({ text: z.string() })
const taskDeleteParser = z.object({ id: z.string() })
const taskUpdateParser = z.object({
  id: z.string(),
  text: z.string().optional(),
  completed: z.boolean().optional(),
})

type Errors = Record<string, string>
type Result = { success: true; data: any } | { success: false; errors: Errors }

export type ActionResult = Result | Promise<Result>

export const onResult = (
  onError: (r: any) => any,
  onSuccess: (r: any) => any,
  r: Result,
) =>
  r.success ? onSuccess(r.data) : onError(r.errors)

export const success = (r: any) => ({ success: true, data: r } as Result)
export const error = (r: Errors) => ({ success: false, errors: r } as Result)

const ALL_TRANSPORTS = ['http', 'websocket', 'terminal'] as const
type Transport = typeof ALL_TRANSPORTS[number]

export type Action = {
  transport: Transport
  mutation: boolean
  parser?: ZodTypeAny
  action: (input: any) => ActionResult
}

export type Actions = Record<string, Action>

const allHelpers = ALL_TRANSPORTS.map((el) => (
  {
    query: (action: (input: any) => ActionResult, parser?: ZodTypeAny) =>
    ({
      transport: el,
      mutation: false,
      parser,
      action,
    } as Action),

    mutation: (action: (input: any) => ActionResult, parser?: ZodTypeAny) =>
    ({
      transport: el,
      mutation: true,
      parser,
      action,
    } as Action)
  }
))

export const makeAction = zipObject(ALL_TRANSPORTS, allHelpers)

const { query, mutation } = makeAction.http

export const tasks: Actions = {
  post: mutation(
    async (input: z.infer<typeof taskCreateParser>) =>
      success(await prisma.task.create({ data: input })),
    taskCreateParser,
  ),
  get: query(async () => success(await prisma.task.findMany())),
  delete: mutation(
    async (input: z.infer<typeof taskDeleteParser>) =>
      success(
        await prisma.task.delete({
          where: input,
        }),
      ),
    taskDeleteParser,
  ),
  put: mutation(
    async (input: z.infer<typeof taskUpdateParser>) =>
      success(
        await prisma.task.update({
          where: { id: input.id },
          data: input,
        }),
      ),
    taskUpdateParser,
  ),
  'send-completed-notifications': query((input: any) => {
    console.log({ hello: 'world', superExpensiveOperation: true })
    return success(null)
  }),
  'clear-completed': mutation(async () => {
    await prisma.task.deleteMany({
      where: { completed: true },
    })
    return success(prisma.task.findMany())
  }),
}

export type DomainActions = Record<string, Actions>

const rules: DomainActions = { tasks }

const findActionInDomain =
  (rules: DomainActions) => (namespace: string, actionName: string) =>
    rules[namespace]?.[actionName] as Action | undefined

export const findAction = findActionInDomain(rules)

export default rules
