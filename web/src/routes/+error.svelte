<script>
  import { page } from '$app/state';
</script>

<main class="mx-auto flex min-h-full max-w-md flex-col justify-center gap-3 px-6 py-16 text-center">
  <p class="text-5xl font-bold text-rally-700">{page.status}</p>
  <p class="text-lg text-stone-600">
    {page.error?.message ?? 'Something went wrong'}
  </p>
  <a href="/" class="mt-2 text-sm font-medium text-rally-700 underline underline-offset-2">
    Back to start
  </a>
</main>
