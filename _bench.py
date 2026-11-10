import os, time, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

U = get_user_model()
admin = U.objects.filter(username='admin').first()
c = APIClient(); c.force_authenticate(user=admin)
c.get('/api/niveaux/')

for url in [
    '/api/users/?exclude_role=ADMIN&page=1&page_size=50',
    '/api/presences/?page=1&page_size=100',
    '/api/notes/?page=1&page_size=100',
    '/api/eleves/?page_size=500',
]:
    ts = []
    for _ in range(3):
        t0 = time.perf_counter(); r = c.get(url); ts.append(time.perf_counter() - t0)
    print('%-52s st=%s  min=%.2fs  med=%.2fs  count=%s' % (
        url, r.status_code, min(ts), sorted(ts)[1], r.data.get('count')))
