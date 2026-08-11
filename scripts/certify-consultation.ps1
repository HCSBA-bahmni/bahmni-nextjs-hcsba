param(
  [string]$BaseUrl = "https://localhost",
  [string]$LocationName = "OPD-1",
  [string]$SyntheticQuery = "test"
)

$ErrorActionPreference = "Stop"

if (-not $env:HCSBA_USERNAME -or -not $env:HCSBA_PASSWORD) {
  throw "Defina HCSBA_USERNAME y HCSBA_PASSWORD sólo en el proceso que ejecuta la certificación."
}

$cookiePath = Join-Path ([System.IO.Path]::GetTempPath()) ("hcsba-consultation-{0}.cookies" -f [Guid]::NewGuid().ToString("N"))

function Invoke-HcsbaJson {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [ValidateSet("GET", "POST")][string]$Method = "GET",
    [string]$Body,
    [string]$Authorization
  )

  $arguments = @("-ksS", "-b", $cookiePath, "-c", $cookiePath, "-X", $Method)
  if ($Authorization) { $arguments += @("-H", "Authorization: Basic $Authorization") }
  if ($Body) { $arguments += @("-H", "Content-Type: application/json", "--data-raw", $Body) }
  $arguments += "${BaseUrl}${Path}"
  $response = & curl.exe @arguments
  if ($LASTEXITCODE -ne 0) { throw "La solicitud HCSBA falló para una ruta de certificación." }
  if (-not $response) { return $null }
  try { return $response | ConvertFrom-Json } catch { return [string]$response }
}

function Get-ResourceRows($response) {
  if ($null -eq $response) { return @() }
  if ($response.PSObject.Properties.Name -contains "results") { return @($response.results) }
  if ($response.PSObject.Properties.Name -contains "pageOfResults") { return @($response.pageOfResults) }
  if ($response -is [Array]) { return @($response) }
  return @($response)
}

try {
  $credentialBytes = [Text.Encoding]::UTF8.GetBytes("$($env:HCSBA_USERNAME):$($env:HCSBA_PASSWORD)")
  $authorization = [Convert]::ToBase64String($credentialBytes)
  $session = Invoke-HcsbaJson -Path "/openmrs/ws/rest/v1/session?v=custom:(uuid)" -Authorization $authorization
  if (-not $session.authenticated) { throw "La cuenta de certificación no fue autenticada." }

  $locations = Get-ResourceRows (Invoke-HcsbaJson -Path "/openmrs/ws/rest/v1/location?tag=Login%20Location&v=full")
  $location = $locations | Where-Object { $_.display -eq $LocationName } | Select-Object -First 1
  if (-not $location) { $location = $locations | Select-Object -First 1 }
  if (-not $location.uuid) { throw "No hay una ubicación de login disponible para certificar." }
  $locationBody = @{ sessionLocation = $location.uuid; locale = "es" } | ConvertTo-Json -Compress
  $null = Invoke-HcsbaJson -Path "/openmrs/ws/rest/v1/session" -Method POST -Body $locationBody

  $encodedQuery = [Uri]::EscapeDataString($SyntheticQuery)
  $searchPath = "/openmrs/ws/rest/v1/bahmni/search/patient/lucene?q=${encodedQuery}&s=byIdOrName&startIndex=0&limit=100&loginLocationUuid=$($location.uuid)&filterOnAllIdentifiers=false"
  $searchRows = Get-ResourceRows (Invoke-HcsbaJson -Path $searchPath)
  $syntheticRows = @($searchRows | Where-Object {
    $candidateText = @($_.name, $_.givenName, $_.familyName, $_.display) -join " "
    $candidateText -match [Regex]::Escape($SyntheticQuery)
  })

  $activeMode = $false
  $withoutVisitMode = $false
  $historicalMode = $false
  $programMode = $false
  $syntheticWithVisits = 0
  $availablePrograms = Get-ResourceRows (Invoke-HcsbaJson -Path "/openmrs/ws/rest/v1/program?v=full")
  $syntheticPrograms = @($availablePrograms | Where-Object {
    @($_.display, $_.name) -join " " -match "(?i)test|prueba"
  })
  $mappingPath = "/openmrs/ws/rest/v1/entitymapping?entityUuid=$($location.uuid)&mappingType=location_encountertype&s=byEntityAndMappingType"
  $mappingResponse = Invoke-HcsbaJson -Path $mappingPath
  $mappingRows = Get-ResourceRows $mappingResponse
  $mappingCount = @($mappingRows | ForEach-Object { @($_.mappings).Count } | Measure-Object -Sum).Sum
  $defaultEncounterType = Invoke-HcsbaJson -Path "/openmrs/ws/rest/v1/bahmnicore/sql/globalproperty?property=bahmni.encounterType.default"
  $defaultEncounterTypeText = ([string]$defaultEncounterType).Trim()
  $defaultEncounterTypeResponse = if ($defaultEncounterTypeText) { Invoke-HcsbaJson -Path ("/openmrs/ws/rest/v1/encountertype/{0}" -f [Uri]::EscapeDataString($defaultEncounterTypeText)) } else { $null }

  foreach ($patient in $syntheticRows) {
    $patientUuid = if ($patient.uuid) { $patient.uuid } elseif ($patient.patientUuid) { $patient.patientUuid } else { $patient.personId }
    if (-not $patientUuid) { continue }
    $visits = Get-ResourceRows (Invoke-HcsbaJson -Path "/openmrs/ws/rest/v1/visit?patient=${patientUuid}&v=full")
    if ($visits.Count -gt 0) { $syntheticWithVisits++ }
    if (@($visits | Where-Object { -not $_.stopDatetime }).Count -gt 0) { $activeMode = $true } else { $withoutVisitMode = $true }

    $encounters = Get-ResourceRows (Invoke-HcsbaJson -Path "/openmrs/ws/rest/v1/encounter?patient=${patientUuid}&v=full")
    if ($encounters.Count -gt 0) { $historicalMode = $true }

    $programs = Get-ResourceRows (Invoke-HcsbaJson -Path "/openmrs/ws/rest/v1/bahmniprogramenrollment?patient=${patientUuid}&v=full")
    if ($programs.Count -gt 0) { $programMode = $true }
  }

  [ordered]@{
    authenticated = $true
    loginLocationAvailable = [bool]$location.uuid
    syntheticQuery = $SyntheticQuery
    syntheticCandidates = $syntheticRows.Count
    syntheticCandidatesWithVisits = $syntheticWithVisits
    configuredPrograms = $availablePrograms.Count
    explicitlySyntheticPrograms = $syntheticPrograms.Count
    encounterTypeResolution = [ordered]@{
      locationMappingRows = $mappingRows.Count
      locationMappings = if ($null -eq $mappingCount) { 0 } else { [int]$mappingCount }
      responseType = if ($null -eq $mappingResponse) { "null" } else { $mappingResponse.GetType().Name }
      responseKeys = if ($mappingResponse -and $mappingResponse.PSObject) { @($mappingResponse.PSObject.Properties.Name) } else { @() }
      defaultPropertyPresent = [bool]$defaultEncounterType
      defaultReferenceKeys = if ($defaultEncounterTypeResponse -and $defaultEncounterTypeResponse.PSObject) { @($defaultEncounterTypeResponse.PSObject.Properties.Name) } else { @() }
      defaultReferenceIsError = [bool]($defaultEncounterTypeResponse.error)
    }
    modes = [ordered]@{
      activeVisit = $activeMode
      withoutVisit = $withoutVisitMode
      historical = $historicalMode
      retrospective = $true
      program = $programMode
    }
  } | ConvertTo-Json -Depth 4
}
finally {
  if (Test-Path -LiteralPath $cookiePath) {
    $resolvedCookie = [System.IO.Path]::GetFullPath($cookiePath)
    $resolvedTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    if ($resolvedCookie.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedCookie -Force
    }
  }
}
