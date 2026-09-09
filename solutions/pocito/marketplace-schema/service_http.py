import os
from pathlib import Path

from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles


def setup_service_http(app, health):
    app.add_api_route('/livez', lambda: {'status': 'ok'}, include_in_schema=False)

    def ready():
        status = health()
        return JSONResponse(status, status_code=200 if all(value == 'ok' for value in status.values()) else 503)

    app.add_api_route('/readyz', ready, include_in_schema=False)
    assets = os.getenv('API_DOCS_DIR')
    if assets:
        app.router.routes[:] = [route for route in app.routes if getattr(route, 'path', '') not in {'/docs', '/redoc', '/docs/oauth2-redirect'}]
        app.mount('/docs-assets', StaticFiles(directory=Path(assets)))
        app.add_api_route('/docs', lambda: get_swagger_ui_html(openapi_url='openapi.json', title=app.title,
          swagger_js_url='docs-assets/swagger-ui-bundle.js', swagger_css_url='docs-assets/swagger-ui.css', swagger_favicon_url=''),
          include_in_schema=False)
        schema = app.openapi
        app.openapi = lambda: schema() | {'servers': [{'url': '.'}]}
